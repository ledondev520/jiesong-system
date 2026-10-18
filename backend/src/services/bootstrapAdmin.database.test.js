/** Synthetic SQLite and real process startup; no environment files or real credentials. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync, spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { ensureBootstrapAdmin } = require('./bootstrapAdmin');

test('bootstrap admin: explicit password, legacy remediation, session revocation and safe reseeding', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-bootstrap-')); fs.chmodSync(dir, 0o700);
  const runtime = path.join(dir, 'runtime');
  const backendRoot = path.resolve(__dirname, '../..');
  // Copy only versioned source, excluding host .env, databases, uploads and runtime state.
  const tracked = execFileSync('git', ['ls-files', '-z', 'backend/src'], { cwd: path.join(backendRoot, '..'), encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of tracked) {
    const target = path.join(runtime, name.slice('backend/'.length));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(backendRoot, '..', name), target);
  }
  fs.symlinkSync(path.join(backendRoot, 'node_modules'), path.join(runtime, 'node_modules'), 'dir');
  const probe = path.join(dir, 'env-path-probe.js');
  fs.writeFileSync(probe, `const Module = require('node:module'); const load = Module._load;
Module._load = function(name, ...args) {
  const loaded = load.call(this, name, ...args);
  if (name === 'dotenv') return { ...loaded, config(options) {
    if (options.path !== ${JSON.stringify(path.join(runtime, '.env'))}) throw new Error('Host environment read attempted');
    return loaded.config(options);
  } };
  return loaded;
};`, { mode: 0o600 });
  const url = `file:${path.join(dir, 'synthetic.db')}`;
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort().filter(name => fs.statSync(path.join(migrations, name)).isDirectory()).map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,os,sys; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', path.join(dir, 'synthetic.db')], { input: ddl });
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => { await db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); });
  const password = crypto.randomBytes(24).toString('hex');
  const startup = () => spawnSync(process.execPath, ['--require', probe, 'src/app.js'], { cwd: runtime, timeout: 10000, encoding: 'utf8', env: {
    PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: url, JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  } });
  const missing = startup(); assert.equal(missing.status, 1); assert.match(missing.stderr, /启动失败/);
  await assert.rejects(ensureBootstrapAdmin(db, { password: '', allowCreate: true }));
  await assert.rejects(ensureBootstrapAdmin(db, { password: 'short', allowCreate: true }));
  assert.equal(await db.user.count(), 0);
  const admin = await ensureBootstrapAdmin(db, { password, allowCreate: true });
  assert.equal(await bcrypt.compare(password, admin.password), true);
  const second = await ensureBootstrapAdmin(db, { password: crypto.randomBytes(24).toString('hex'), allowCreate: true });
  assert.equal(second.password, admin.password);
  await ensureBootstrapAdmin(db, { password: undefined });
  await db.user.update({ where: { id: admin.id }, data: { password: await bcrypt.hash('123456', 4), sessionVersion: 3 } });
  await assert.rejects(ensureBootstrapAdmin(db, { password: undefined }), /必须设置/);
  const blocked = startup(); assert.equal(blocked.status, 1); assert.match(blocked.stderr, /启动失败/); assert.equal(blocked.stderr.includes(password), false);
  const upgraded = await ensureBootstrapAdmin(db, { password });
  assert.equal(upgraded.sessionVersion, 4); assert.equal(await bcrypt.compare(password, upgraded.password), true);
  assert.equal(await bcrypt.compare('123456', upgraded.password), false);
  assert.equal((await ensureBootstrapAdmin(db, { password: undefined })).sessionVersion, 4);
  const portProbe = require('node:net').createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const child = spawn(process.execPath, ['--require', probe, 'src/app.js'], { cwd: runtime, stdio: 'ignore', env: {
    PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: url,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), PORT: String(port), UPLOAD_DIR: path.join(dir, 'uploads'),
  } });
  try {
    const deadline = Date.now() + 10000;
    let healthy = false;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, 'secure admin startup must stay running');
      try { healthy = (await fetch(`http://127.0.0.1:${port}/health`)).status === 200; } catch {}
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(healthy, true, 'actual server must reach health endpoint after password remediation');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }

});
