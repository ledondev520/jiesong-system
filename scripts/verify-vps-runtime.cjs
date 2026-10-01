// VPS requires Node.js >=20, PM2 and an already-built frontend; no credentials are printed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function validateRuntime(processes, root) {
  for (const [name, directory] of [['jiesong-backend', 'backend'], ['jiesong-frontend', 'frontend']]) {
    const matches = processes.filter(process => process.name === name);
    assert.equal(matches.length, 1, `${name}: expected one process`);
    assert.equal(matches[0].pm2_env.status, 'online', `${name}: process is not online`);
    assert.equal(path.resolve(matches[0].pm2_env.pm_cwd), path.join(root, directory), `${name}: running an old checkout`);
  }
}

function validatePublicBuild(html, buildId) {
  assert.ok(buildId && html.includes(buildId), 'Public login page does not match the deployed build');
  assert.ok(!html.includes('user-scalable=no'), 'Public page still disables mobile zoom');
}

async function verify(origin) {
  const root = path.resolve(__dirname, '..');
  let processes;
  try {
    processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch {
    throw new Error('Unable to read PM2 state');
  }
  validateRuntime(processes, root);
  const buildId = fs.readFileSync(path.join(root, 'frontend/.next/BUILD_ID'), 'utf8').trim();
  const base = new URL(origin);
  assert.equal(base.protocol, 'https:', 'Public origin must use HTTPS');
  const deadline = Date.now() + 30000;
  let lastError;
  do {
    try {
      const health = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(4000) });
      assert.ok(health.ok, 'Backend health check failed');
      const response = await fetch(new URL('/login', base), { signal: AbortSignal.timeout(4000) });
      assert.ok(response.ok, 'Public login page is unavailable');
      validatePublicBuild(await response.text(), buildId);
      const api = await fetch(new URL('/api/v1/products', base), { signal: AbortSignal.timeout(4000) });
      assert.equal(api.status, 401, 'Public API must require authentication');
      console.log('VPS process paths, backend health, public build and API authentication verified.');
      return;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  throw lastError;
}

if (require.main === module) {
  verify(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { validateRuntime, validatePublicBuild };
