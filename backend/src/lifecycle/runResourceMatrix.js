const assert = require('node:assert/strict');

async function runResourceMatrix(t, resource, { call, good, snapshot }) {
  const m = resource.matrix;
  let created, edited, cleared;
  const expected = { ...m.create, ...m.edit };
  const assertFields = (actual, fields) => {
    for (const [field, value] of Object.entries(fields))
      assert.deepEqual(actual[field], value, `${resource.id}.${field}`);
  };
  const readback = async () => {
    const result = await good('GET', `${m.path}?page=1&pageSize=20`);
    const row = result.items.find((row) => row.id === created.id);
    assert.ok(row, 'fresh HTTP GET must contain the saved row');
    return row;
  };
  await t.test('create', async () => {
    created = await good('POST', m.path, m.create);
    assertFields(created, m.create);
  });
  await t.test('edit only explicit fields', async () => {
    edited = await good('PUT', `${m.path}/${created.id}`, m.edit);
    assertFields(edited, expected);
  });
  await t.test(
    'invalid edits are atomic and blank optional fields retain values',
    async () => {
      for (const input of m.invalid) {
        const before = snapshot(m.table);
        const result = await call('PUT', `${m.path}/${created.id}`, input);
        assert.equal(result.status, 400, JSON.stringify(input));
        assert.deepEqual(
          snapshot(m.table),
          before,
          'invalid save must not alter fields or timestamps',
        );
      }
      await good('PUT', `${m.path}/${created.id}`, m.blank);
      assertFields(await readback(), expected);
    },
  );
  await t.test(
    'only explicit null clears nullable fields; required fields reject clearing',
    async () => {
      const before = snapshot(m.table);
      const result = await call('PUT', `${m.path}/${created.id}`, m.clear);
      assert.equal(result.status, m.clearStatus);
      if (m.clearStatus === 400) assert.deepEqual(snapshot(m.table), before);
      else Object.assign(expected, m.clear);
      cleared = await readback();
      assertFields(cleared, expected);
    },
  );
  await t.test(
    'refresh reads saved fields through HTTP and an independent read-only connection',
    async () => {
      assertFields(await readback(), expected);
      assertFields(
        snapshot(m.table).find((row) => row.id === created.id),
        expected,
      );
    },
  );
  const returnTo = `${m.path}?keyword=${encodeURIComponent(m.filter)}&page=1&pageSize=20`;
  await t.test(
    'return with filters retains the query and reads the edited row',
    async () => {
      const before = await good('GET', returnTo);
      await good('GET', `${m.path}?page=1&pageSize=20`);
      const after = await good('GET', returnTo);
      assert.equal(after.pagination.page, 1);
      assert.equal(after.pagination.pageSize, 20);
      assert.deepEqual(
        after.items.map((row) => row.id),
        before.items.map((row) => row.id),
      );
      assertFields(
        after.items.find((row) => row.id === created.id),
        expected,
      );
    },
  );
  return {
    resource: resource.id,
    created,
    edited,
    cleared,
    returnTo,
    readback: await readback(),
  };
}
module.exports = { runResourceMatrix };
