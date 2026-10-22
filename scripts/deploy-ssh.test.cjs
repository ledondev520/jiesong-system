const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const workflow = readFileSync(path.join(repo, '.github/workflows/deploy.yml'), 'utf8');
// This step is a literal YAML block. Fail closed if its name/layout stops matching.
const step = workflow.match(/^      - name: Deploy to Production via SSH\n[\s\S]*?^        run: \|\n((?:^          .*\n|^\n)+)/m);
assert.ok(step, 'cannot extract the production SSH run block');
const runBlock = step[1].replace(/^          /gm, '');

function runDeployment(t, { missingRuntime = false, nginxTestStatus = 0, verifierStatus = 0 } = {}) {
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
  copyFileSync(path.join(repo, 'scripts/require-node-runtime.sh'), path.join(checkout, 'scripts/require-node-runtime.sh'));
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
[[ "$4" =~ ^bash\\ -s\\ --(\\ [A-Za-z0-9+/=]+){4}$ ]]
# Like SSH, evaluate the remote command while preserving its script stdin.
exec /bin/bash -c "$4"`);
  executable(path.join(bin, 'npm'), `
printf 'npm\\n' >> "$TEST_EVENTS"
cat >> "$TEST_NPM_STDIN"`);
  for (const command of ['git', 'npx', 'pm2']) {
    executable(path.join(bin, command), `printf '${command}\\n' >> "$TEST_EVENTS"`);
  }
  // Trace pricing backup/copies as well as git; no real checkout is mutated.
  for (const command of ['mktemp', 'cp']) {
    executable(path.join(bin, command), `
printf '${command}\\n' >> "$TEST_EVENTS"
exec /usr/bin/${command} "$@"`);
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
