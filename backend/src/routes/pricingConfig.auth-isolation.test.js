const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('pricing authentication regression runs without reading an ignored host environment file', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-auth-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.resolve(__dirname, '../../..');
  const backend = path.join(dir, 'backend');
  fs.cpSync(path.join(root, 'backend/src'), path.join(backend, 'src'), { recursive: true });
  fs.cpSync(path.join(root, 'backend/prisma/migrations'), path.join(backend, 'prisma/migrations'), { recursive: true });
  fs.cpSync(path.join(root, 'config'), path.join(dir, 'config'), { recursive: true });
  fs.symlinkSync(path.join(root, 'backend/node_modules'), path.join(backend, 'node_modules'), 'dir');
  const hostEnv = path.join(backend, '.env');
  fs.writeFileSync(hostEnv, 'SYNTHETIC_ENV_MUST_NOT_BE_READ=1\n', { mode: 0o600 });
  const probe = path.join(dir, 'probe.cjs');
  fs.writeFileSync(probe, `const fs = require('node:fs');
const read = fs.readFileSync;
fs.readFileSync = function(target, ...args) {
  if (String(target) === ${JSON.stringify(hostEnv)}) throw new Error('Host environment read attempted');
  return read.call(this, target, ...args);
};\n`);
  const result = spawnSync(process.execPath, ['--require', probe, '--test', 'src/routes/pricingConfig.auth.test.js'], {
    cwd: backend, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', JWT_SECRET: 'test-only-auth-isolation-never-production' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
