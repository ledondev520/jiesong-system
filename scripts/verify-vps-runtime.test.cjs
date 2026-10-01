const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntime, validatePublicBuild } = require('./verify-vps-runtime.cjs');

test('deployment rejects the prior release directory and a stale public build', () => {
  const root = '/opt/jiesong-system';
  const processes = ['backend', 'frontend'].map(part => ({ name: `jiesong-${part}`, pm2_env: { status: 'online', pm_cwd: `${root}/${part}` } }));
  assert.doesNotThrow(() => validateRuntime(processes, root));
  assert.throws(() => validateRuntime([...processes, processes[0]], root), /expected one/);
  processes[1].pm2_env.pm_cwd = '/opt/jiesong_system/releases/old/frontend';
  assert.throws(() => validateRuntime(processes, root), /old checkout/);
  assert.doesNotThrow(() => validatePublicBuild('<script>build-current</script>', 'build-current'));
  assert.throws(() => validatePublicBuild('<script>build-old</script>', 'build-current'), /does not match/);
  assert.throws(() => validatePublicBuild('build-current user-scalable=no', 'build-current'), /mobile zoom/);
});
