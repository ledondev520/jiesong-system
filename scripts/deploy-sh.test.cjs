// Static guards for the manual deploy.sh (B66/P0-10). deploy.sh is never executed here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const script = readFileSync(path.resolve(__dirname, '../deploy.sh'), 'utf8');
const code = script.replace(/^\s*#.*$/gm, '');

test('deploy.sh never falls back to prisma db push', () => {
  assert.ok(!/db push/.test(code));
  assert.match(code, /npx prisma migrate deploy\n/);
  assert.ok(!/migrate deploy\s*(\|\||;)/.test(code), 'migrate failure must stop the script (set -e), no fallback');
});

test('deploy.sh takes a private integrity-checked snapshot of an existing DB before migrating', () => {
  const snapshot = code.indexOf('.backup');
  assert.ok(snapshot > 0 && snapshot < code.indexOf('npx prisma migrate deploy'));
  assert.match(code, /umask 077 && sqlite3[^\n]*\.backup/);
  assert.match(code, /integrity_check/);
});

test('deploy.sh only creates backend/.env when missing, with a random secret and 0600', () => {
  assert.match(code, /if \[ -e "\$APP_DIR\/backend\/\.env" \]/);
  const guard = code.indexOf('if [ -e "$APP_DIR/backend/.env" ]');
  const writes = [...code.matchAll(/cat > "?\$APP_DIR\/backend\/\.env"? </g)].map(m => m.index);
  assert.ok(writes.length === 1 && writes[0] > code.indexOf('else', guard), 'the only .env write must sit in the else branch');
  assert.match(code, /openssl rand -hex 32/);
  assert.match(code, /chmod 600 "\$APP_DIR\/backend\/\.env"/);
  assert.ok(!/your-super-secret|jiesong_pass/.test(script));
});

test('deploy.sh runs the SQLite backend as a single fork process', () => {
  assert.match(code, /instances: 1,\s*exec_mode: 'fork'/);
  assert.ok(!/exec_mode: 'cluster'/.test(code));
});
