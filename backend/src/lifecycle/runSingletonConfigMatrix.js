const assert = require('node:assert/strict');

// File operations come from the private fixture; HTTP uses the authenticated app.
async function runSingletonConfigMatrix(
  t,
  resource,
  { call, good, fileSnapshot, withFileLock },
) {
  assert.equal(resource.kind, 'singleton-config');
  assert.equal(
    resource.matrix.adapter,
    'pricing-config-file',
    'add a real singleton adapter before registering another store',
  );
  const m = resource.matrix;
  let initial, replaced;
  const readback = async (expected) => {
    const current = await good('GET', m.path);
    const disk = fileSnapshot();
    assert.deepEqual(
      current.config,
      expected,
      'fresh HTTP GET must contain the complete snapshot',
    );
    assert.deepEqual(
      disk.config,
      expected,
      'independent file read must contain the complete snapshot',
    );
    assert.equal(
      current.revision,
      disk.revision,
      'HTTP revision must hash the actual file bytes',
    );
    assert.equal(disk.mode, 0o600);
    return current;
  };
  const rejected = async (body, status) => {
    const before = fileSnapshot();
    const response = await call('PUT', m.path, body);
    assert.equal(response.status, status);
    assert.deepEqual(
      fileSnapshot(),
      before,
      'rejected replacement must preserve bytes, identity, mode and timestamps',
    );
    await readback(m.replace);
  };
  await t.test('initial complete snapshot from HTTP and file', async () => {
    initial = await readback(m.initial);
  });
  await t.test(
    'replace the complete validated snapshot atomically',
    async () => {
      const before = fileSnapshot();
      replaced = await good('PUT', m.path, {
        config: m.replace,
        revision: initial.revision,
      });
      assert.deepEqual(replaced.config, m.replace);
      assert.notEqual(replaced.revision, initial.revision);
      assert.notEqual(
        fileSnapshot().ino,
        before.ino,
        'replacement must publish a new file',
      );
      assert.equal(replaced.revision, (await readback(m.replace)).revision);
    },
  );
  await t.test(
    'identical replacement preserves the file and revision',
    async () => {
      const before = fileSnapshot();
      const result = await good('PUT', m.path, {
        config: m.replace,
        revision: replaced.revision,
      });
      assert.equal(result.revision, replaced.revision);
      assert.deepEqual(fileSnapshot(), before);
    },
  );
  await t.test(
    'invalid and incomplete snapshots are rejected atomically',
    async () => {
      for (const config of m.invalid)
        await rejected({ config, revision: replaced.revision }, 400);
    },
  );
  await t.test(
    'missing and malformed revisions cannot replace the file',
    async () => {
      for (const revision of [undefined, null, '', 'invalid'])
        await rejected({ config: m.initial, revision }, 400);
    },
  );
  await t.test(
    'a stale revision cannot overwrite a newer snapshot',
    async () => {
      await rejected({ config: m.initial, revision: initial.revision }, 409);
    },
  );
  await t.test(
    'a concurrent writer lock rejects replacement without changing the file',
    async () => {
      await withFileLock(() =>
        rejected({ config: m.initial, revision: replaced.revision }, 409),
      );
    },
  );
  await t.test(
    'refresh reads the persisted replacement through HTTP and the file',
    async () => {
      assert.equal((await readback(m.replace)).revision, replaced.revision);
    },
  );
  return {
    resource: resource.id,
    initial,
    replaced,
    readback: await readback(m.replace),
  };
}
module.exports = { runSingletonConfigMatrix };
