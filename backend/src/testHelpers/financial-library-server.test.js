/**
 * Input: Hosted library fixture, real login/Express and independent private SQLite reads
 * Output: Fixture-contract proof for current ADMIN/FINANCE login and source detail
 * Pos: Browser-independent verification of the exact hosted financial library backend
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readDatabase } = require('./financial-library-data');

test('financial library hosted fixture: real ADMIN/FINANCE login reads the actual CLI-ingested source without writes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-financial-library-'));
  fs.chmodSync(directory, 0o700);
  const server = spawn(process.execPath, [path.join(__dirname, 'financial-library-server.js')], {
    env: { PATH: process.env.PATH, TMPDIR: os.tmpdir(), TZ: 'UTC', NODE_ENV: 'test', FINANCIAL_LIBRARY_TEST_DIR: directory },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
        server.once('exit', () => { clearTimeout(timeout); resolve(); });
        server.kill('SIGTERM');
      });
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const fixture = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Synthetic library backend startup timed out')), 40000);
    server.once('message', message => { clearTimeout(timeout); resolve(message); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Synthetic library backend exited before startup')); });
  });
  assert.match(fixture.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'synthetic.db')).mode & 0o777, 0o600);
  for (const role of ['ADMIN', 'FINANCE']) {
    const login = await fetch(`${fixture.baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: fixture.users[role].username, password: 'test-only-financial-library-password-never-production' }) });
    assert.equal(login.status, 200);
    const identity = (await login.json()).data;
    assert.equal(identity.user.id, fixture.users[role].id);
    assert.equal(identity.user.role, role);
    const before = readDatabase(directory);
    const response = await fetch(`${fixture.baseURL}/api/v1/finance/statements/evidence/documents/${fixture.documents.GENERAL_LEDGER}`, { headers: { authorization: `Bearer ${identity.token}` } });
    assert.equal(response.status, 200);
    const detail = (await response.json()).data;
    assert.deepEqual(detail.rows[2].values, ['合成账行1', 125.5, 0, -20.25, 'SYNTHETIC-BIZ-ID', null, true]);
    assert.equal(detail.pagination.totalPages, 2);
    assert.equal(detail.originalArchived, false);
    assert.deepEqual(readDatabase(directory), before);
    assert.deepEqual(fs.readdirSync(path.join(directory, 'uploads')), []);
  }
});
