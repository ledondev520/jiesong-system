const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, readdirSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const workflow = readFileSync(path.join(repo, '.github/workflows/deploy.yml'), 'utf8');
// This step is a literal YAML block. Fail closed if its name/layout stops matching.
const step = workflow.match(/^      - name: Deploy to Production via SSH\n[\s\S]*?^        run: \|\n((?:^          .*\n|^\n)+)/m);
assert.ok(step, 'cannot extract the production SSH run block');
const runBlock = step[1].replace(/^          /gm, '');

function runDeployment(t, { priorSnapshots = [], missingRuntime = false, missingGuard = false, nginxTestStatus = 0, verifierStatus = 0, migrateStatus = 'ok', migrateDeployStatus = 0, databaseUrl = null, integrity = 'ok', gitStatus = 0 } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'deploy-ssh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'checkout');
  const bin = path.join(root, 'bin');
  const runtime = path.join(root, "node runtime ' $literal");
  for (const dir of [bin, path.join(runtime, 'bin'), ...['backend', 'frontend', 'scripts', 'config'].map(part => path.join(checkout, part))]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  // Synthetic runtime pricing must exist so early failures exercise the backup branch.
  const pricing = '{"syntheticRuntimePricing":true}\n';
  writeFileSync(path.join(checkout, 'config/pricing.json'), pricing, { mode: 0o600 });
  writeFileSync(path.join(root, 'events'), '');
  // Synthetic prod DB + .env so the pre-migrate snapshot step can resolve it.
  writeFileSync(path.join(root, 'prod.db'), 'synthetic-sqlite', { mode: 0o600 });
  const envUrl = databaseUrl === null ? `file:${path.join(root, 'prod.db')}` : databaseUrl;
  if (envUrl !== '') writeFileSync(path.join(checkout, 'backend/.env'), `DATABASE_URL="${envUrl}"\n`, { mode: 0o600 });
  mkdirSync(path.join(root, 'scripts'), { mode: 0o700 });
  copyFileSync(path.join(repo, 'scripts/require-node-runtime.sh'), path.join(root, 'scripts/require-node-runtime.sh'));
  if (!missingGuard) copyFileSync(path.join(repo, 'scripts/require-node-runtime.sh'), path.join(checkout, 'scripts/require-node-runtime.sh'));
  copyFileSync(path.join(repo, 'scripts/prune-deploy-snapshots.sh'), path.join(checkout, 'scripts/prune-deploy-snapshots.sh'));
  for (const name of priorSnapshots) mkdirSync(path.join(root, 'backups', name), { recursive: true, mode: 0o700 });
  const executable = (filename, body) => writeFileSync(filename, `#!/bin/bash\nset -eu\n${body}\n`, { mode: 0o700 });

  // Map only the production checkout path; execute the extracted source unchanged.
  const bashEnv = path.join(root, 'bash-env');
  writeFileSync(bashEnv, `cd() {
  if [ "\${1-}" = /opt/jiesong-system ]; then
    builtin cd "$TEST_CHECKOUT"
  else
    builtin cd "$@"
  fi
}
`, { mode: 0o600 });
  executable(path.join(bin, 'ssh'), `
test "$#" -eq 4
test "$1" = -p
test "$2" = 2222
test "$3" = deploy@example.invalid
[[ "$4" =~ ^bash\\ -s\\ --(\\ [A-Za-z0-9+/=]+){5}$ ]]
# Like SSH, evaluate the remote command while preserving its script stdin.
exec /bin/bash -c "$4"`);
  executable(path.join(bin, 'npm'), `
printf 'npm\\n' >> "$TEST_EVENTS"
cat >> "$TEST_NPM_STDIN"`);
  executable(path.join(bin, 'git'), `printf 'git\\n' >> "$TEST_EVENTS"
exit "$TEST_GIT_STATUS"`);
  executable(path.join(bin, 'sqlite3'), `
case "\${2-}" in
  .backup*) printf 'sqlite3 backup\\n' >> "$TEST_EVENTS"; cp "$1" "\${2#.backup }" ;;
  PRAGMA*) printf 'sqlite3 integrity\\n' >> "$TEST_EVENTS"; echo "$TEST_INTEGRITY" ;;
  *) exit 99 ;;
esac`);
  // Log subcommands so tests can assert migrate/stop/start ordering.
  executable(path.join(bin, 'pm2'), `printf 'pm2 %s %s\\n' "$1" "\${2-}" >> "$TEST_EVENTS"`);
  executable(path.join(bin, 'npx'), `
printf 'npx %s %s\\n' "$1" "\${2-}" >> "$TEST_EVENTS"
if [ "$1 \${2-}" = 'prisma migrate' ]; then
  case "$3" in
    status)
      case "$TEST_MIGRATE_STATUS" in
        ok) echo 'Database schema is up to date!' ;;
        pending) echo 'Following migration have not yet been applied:'; exit 1 ;;
        failed) echo 'Following migration have failed:'; echo 'Following migration have not yet been applied:'; exit 1 ;;
        error) echo 'Error: P1003: Database does not exist'; exit 1 ;;
        diverged) echo 'Your local migration history and the migrations table from your database are different:'; echo 'Following migration have not yet been applied:'; exit 1 ;;
      esac ;;
    deploy) exit "$TEST_MIGRATE_DEPLOY_STATUS" ;;
  esac
fi`);
  // Trace pricing backup/copies as well as git; no real checkout is mutated.
  for (const command of ['mktemp', 'cp']) {
    // macOS keeps cp in /bin; Ubuntu usually provides it in /usr/bin.
    const systemCommand = [`/usr/bin/${command}`, `/bin/${command}`].find(existsSync);
    assert.ok(systemCommand, `system ${command} is required for the deployment fixture`);
    executable(path.join(bin, command), `
printf '${command}\\n' >> "$TEST_EVENTS"
exec "${systemCommand}" "$@"`);
  }
  executable(path.join(bin, 'sudo'), `
case "$*" in
  'nginx -t')
    printf 'nginx-test\\n' >> "$TEST_EVENTS"
    exit "$TEST_NGINX_STATUS"
    ;;
  'systemctl reload nginx') printf 'nginx-reload\\n' >> "$TEST_EVENTS" ;;
  *) exit 99 ;;
esac`);
  if (!missingRuntime) {
    executable(path.join(runtime, 'bin/node'), `
if [ "\${1-}" = -e ]; then
  # Only stub the version probe; source the real runtime guard above it.
  printf 'runtime-check\\n' >> "$TEST_EVENTS"
  exit 0
fi
test "$1" = /opt/jiesong-system/scripts/verify-vps-runtime.cjs
test "$#" -eq 2
printf 'verifier\\n' >> "$TEST_EVENTS"
printf '%s' "$2" > "$TEST_VERIFIER_URL"
exit "$TEST_VERIFIER_STATUS"`);
  }
  const publicUrl = "https://example.invalid/a path?literal='$(touch injection-marker)'\n`uname`";
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', runBlock], {
    cwd: root,
    // Synthetic environment only: never inherit deployment credentials/configuration.
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      BASH_ENV: bashEnv,
      NODE_RUNTIME: runtime,
      SSH_PORT: '2222',
      SSH_USER: 'deploy',
      SSH_HOST: 'example.invalid',
      DEPLOY_REF: 'v-test',
      DEPLOY_SHA: 'test-sha',
      PRODUCTION_URL: publicUrl,
      TEST_CHECKOUT: checkout,
      TEST_EVENTS: path.join(root, 'events'),
      TEST_NPM_STDIN: path.join(root, 'npm-stdin'),
      TEST_VERIFIER_URL: path.join(root, 'verifier-url'),
      TEST_VERIFIER_STATUS: String(verifierStatus),
      TEST_NGINX_STATUS: String(nginxTestStatus),
      TEST_MIGRATE_STATUS: migrateStatus,
      TEST_MIGRATE_DEPLOY_STATUS: String(migrateDeployStatus),
      TEST_INTEGRITY: integrity,
      TEST_GIT_STATUS: String(gitStatus),
      DEPLOY_BACKUP_ROOT: path.join(root, 'backups'),
      TMPDIR: root,
    },
    input: '',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return {
    ...result,
    root,
    publicUrl,
    pricing,
    events: readFileSync(path.join(root, 'events'), 'utf8').trim().split('\n').filter(Boolean),
  };
}

test('stdin-reading npm cannot consume the SSH program or skip verification', t => {
  const result = runDeployment(t);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.events.includes('npm'), 'npm must actually run');
  assert.ok(result.events.includes('nginx-reload'), 'valid nginx config must be reloaded');
  assert.equal(result.events.at(-1), 'verifier', 'verification must run after deployment');
  assert.equal(readFileSync(path.join(result.root, 'npm-stdin'), 'utf8'), '');
  assert.equal(readFileSync(path.join(result.root, 'verifier-url'), 'utf8'), result.publicUrl);
});

test('a failing verifier fails the SSH step even when npm reads stdin', t => {
  const result = runDeployment(t, { verifierStatus: 37 });
  assert.equal(result.events.at(-1), 'verifier', 'the failing verifier must be reached');
  assert.equal(result.status, 37, result.stderr);
});

test('a missing dedicated runtime fails before npm', t => {
  const result = runDeployment(t, { missingRuntime: true });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /NODE_RUNTIME\/bin\/node is missing or not executable/);
  assert.ok(!result.events.includes('npm'));
  assert.ok(!result.events.includes('verifier'));
});

test('a failing nginx config test fails the SSH step before reload and verification', t => {
  const result = runDeployment(t, { nginxTestStatus: 23 });
  assert.ok(result.events.includes('nginx-test'), 'nginx config test must actually run');
  assert.notEqual(result.status, 0, result.stderr);
  assert.ok(!result.events.includes('nginx-reload'), 'invalid config must not be reloaded');
  assert.ok(!result.events.includes('verifier'), 'verification must not follow a failed config test');
});

test('a missing runtime aborts before git or any pricing backup/change', t => {
  const result = runDeployment(t, { missingRuntime: true });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /NODE_RUNTIME\/bin\/node is missing or not executable/);
  assert.ok(!result.events.includes('git'), 'no git command may run before runtime validation');
  assert.ok(!result.events.includes('mktemp'), 'pricing backup must not be created');
  assert.ok(!result.events.includes('cp'), 'pricing must not be copied or restored');
  assert.equal(readFileSync(path.join(result.root, 'checkout/config/pricing.json'), 'utf8'), result.pricing);
});

test('target-commit guard deploys successfully when the old server checkout has no guard', t => {
  const result = runDeployment(t, { missingGuard: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.events[0], 'runtime-check');
  assert.equal(result.events.at(-1), 'verifier');
});

test('a missing dedicated runtime fails before npm when the server checkout has no guard', t => {
  const result = runDeployment(t, { missingRuntime: true, missingGuard: true });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /NODE_RUNTIME\/bin\/node is missing or not executable/);
  assert.ok(!result.events.includes('npm'));
  assert.ok(!result.events.includes('verifier'));
});

test('a missing runtime aborts before git or any pricing backup/change when the server checkout has no guard', t => {
  const result = runDeployment(t, { missingRuntime: true, missingGuard: true });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /NODE_RUNTIME\/bin\/node is missing or not executable/);
  assert.ok(!result.events.includes('git'), 'no git command may run before runtime validation');
  assert.ok(!result.events.includes('mktemp'), 'pricing backup must not be created');
  assert.ok(!result.events.includes('cp'), 'pricing must not be copied or restored');
  assert.equal(readFileSync(path.join(result.root, 'checkout/config/pricing.json'), 'utf8'), result.pricing);
});

test('no pending migration skips migrate deploy and never stops the backend', t => {
  const result = runDeployment(t);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.events.includes('npx prisma migrate'), 'status check must run');
  assert.ok(!result.events.includes('pm2 stop jiesong-backend'));
  assert.equal(result.events.filter(e => e === 'npx prisma migrate').length, 1, 'only status, no deploy');
  assert.ok(result.events.includes('pm2 restart jiesong-backend'));
});

test('pending migration stops the backend only around migrate deploy, then restarts it', t => {
  const result = runDeployment(t, { migrateStatus: 'pending' });
  assert.equal(result.status, 0, result.stderr);
  const e = result.events;
  const stop = e.indexOf('pm2 stop jiesong-backend');
  const restart = e.indexOf('pm2 restart jiesong-backend');
  assert.equal(e.filter(x => x === 'npm').length, 3, 'backend install, frontend install, build');
  assert.ok(e.lastIndexOf('npm') < stop, 'build before stop');
  assert.ok(stop > -1 && stop < e.lastIndexOf('npx prisma migrate') && e.lastIndexOf('npx prisma migrate') < restart);
  assert.equal(e.at(-1), 'verifier');
});

test('pending migration takes a private, integrity-checked snapshot after the stop and before migrate deploy', t => {
  const result = runDeployment(t, { migrateStatus: 'pending' });
  assert.equal(result.status, 0, result.stderr);
  const e = result.events;
  assert.ok(e.indexOf('pm2 stop jiesong-backend') < e.indexOf('sqlite3 backup'));
  assert.ok(e.indexOf('sqlite3 backup') < e.indexOf('sqlite3 integrity'));
  assert.ok(e.indexOf('sqlite3 integrity') < e.lastIndexOf('npx prisma migrate'), 'snapshot before migrate deploy');
  const backups = path.join(result.root, 'backups');
  const [dir] = readdirSync(backups);
  assert.match(dir, /^auto-premigrate-test-sh-\d{8}T\d{6}Z$/);
  assert.equal(statSync(path.join(backups, dir)).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(backups, dir, 'premigrate.db')).mode & 0o777, 0o600);
  assert.match(result.stdout, /pre-migrate snapshot: .*auto-premigrate-test-sh-/);
});

const retentionFixture = () => [
  ...Array.from({ length: 13 }, (_, i) => `auto-premigrate-abc1234-202601${String(i + 1).padStart(2, '0')}T000000Z`),
  'pre-manual-backup',
];

test('a verified deploy with a new snapshot prunes old auto snapshots after verification', t => {
  const result = runDeployment(t, { migrateStatus: 'pending', priorSnapshots: retentionFixture() });
  assert.equal(result.status, 0, result.stderr);
  const left = readdirSync(path.join(result.root, 'backups'));
  assert.equal(left.filter(name => name.startsWith('auto-premigrate-')).length, 12);
  assert.ok(left.includes('pre-manual-backup'));
  assert.ok(left.some(name => name.startsWith('auto-premigrate-test-sh-')), 'new snapshot is kept');
  assert.ok(!left.includes('auto-premigrate-abc1234-20260101T000000Z'), 'oldest is pruned');
  assert.ok(!left.includes('auto-premigrate-abc1234-20260102T000000Z'), 'second oldest is pruned');
});

test('a failed verification or a deploy without a new snapshot prunes nothing', t => {
  const failed = runDeployment(t, { migrateStatus: 'pending', verifierStatus: 7, priorSnapshots: retentionFixture() });
  assert.notEqual(failed.status, 0);
  assert.equal(readdirSync(path.join(failed.root, 'backups')).length, 15);
  const noMigration = runDeployment(t, { priorSnapshots: retentionFixture() });
  assert.equal(noMigration.status, 0, noMigration.stderr);
  assert.equal(readdirSync(path.join(noMigration.root, 'backups')).length, 14);
});

test('a failing migrate deploy restarts the backend, reports the snapshot and fails the step', t => {
  const result = runDeployment(t, { migrateStatus: 'pending', migrateDeployStatus: 5 });
  assert.equal(result.status, 5, result.stderr);
  const e = result.events;
  assert.ok(e.indexOf('pm2 stop jiesong-backend') > -1);
  assert.ok(e.indexOf('pm2 start jiesong-backend') > e.indexOf('pm2 stop jiesong-backend'), 'backend must be started again');
  assert.ok(!e.includes('verifier'));
  assert.match(result.stderr, /MIGRATION FAILED: backend restarted on partially migrated DB; snapshot at \S+auto-premigrate-test-sh-\S+; follow docs\/operations\/production-rollback\.md/);
});

test('an unresolvable prod DB or a bad snapshot never leaves the backend stopped without a migration', t => {
  for (const options of [{ databaseUrl: '' }, { databaseUrl: 'postgresql://x' }, { databaseUrl: 'file:/nonexistent/prod.db' }]) {
    const result = runDeployment(t, { migrateStatus: 'pending', ...options });
    assert.notEqual(result.status, 0, JSON.stringify(options));
    assert.ok(!result.events.some(e => e.startsWith('pm2 ')), `no pm2 call: ${JSON.stringify(options)}`);
    assert.ok(!result.events.includes('sqlite3 backup'));
    assert.match(result.stderr, /aborting before stopping the backend/);
  }
  const bad = runDeployment(t, { migrateStatus: 'pending', integrity: 'corrupt' });
  assert.notEqual(bad.status, 0);
  assert.ok(bad.events.includes('pm2 start jiesong-backend'), 'backend restarted');
  assert.equal(bad.events.filter(e => e === 'npx prisma migrate').length, 1, 'migrate deploy must not run');
  assert.doesNotMatch(bad.stderr, /MIGRATION FAILED/);
});

test('failed or errored migrate status aborts without stopping the backend', t => {
  for (const migrateStatus of ['failed', 'error', 'diverged']) {
    const result = runDeployment(t, { migrateStatus });
    assert.notEqual(result.status, 0, migrateStatus);
    assert.ok(!result.events.includes('pm2 stop jiesong-backend'), migrateStatus);
    assert.equal(result.events.filter(e => e === 'npm').length, 1, 'abort before the frontend build');
    assert.ok(!result.events.some(e => e.startsWith('pm2 ')), 'no pm2 call at all');
  }
});

test('a failing git step still removes the private pricing backup temp file', t => {
  const result = runDeployment(t, { gitStatus: 1 });
  assert.notEqual(result.status, 0, result.stderr);
  assert.ok(result.events.includes('mktemp'), 'the pricing backup branch must have run');
  assert.deepEqual(readdirSync(result.root).filter(name => name.startsWith('tmp.')), [], 'no leaked pricing backup');
});

test('production deploy pins the SSH host key from a secret and never runs ssh-keyscan', () => {
  assert.ok(!/ssh-keyscan\s+-/.test(workflow.replace(/^\s*#.*$/gm, '')), 'ssh-keyscan must not be executed');
  const pin = workflow.match(/- name: Pin host key in known_hosts\n[\s\S]*?\n\n/);
  assert.ok(pin, 'pin step missing');
  assert.match(pin[0], /SSH_KNOWN_HOSTS: \$\{\{ secrets\.SSH_KNOWN_HOSTS \}\}/);
  assert.match(pin[0], /-z "\$SSH_KNOWN_HOSTS"[\s\S]*exit 1/, 'empty secret must fail closed');
  assert.match(pin[0], /umask 077/);
});
