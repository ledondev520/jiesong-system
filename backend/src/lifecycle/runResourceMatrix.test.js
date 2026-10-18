const test = require('node:test');
const assert = require('node:assert/strict');
const { runResourceMatrix } = require('./runResourceMatrix');
const resource = require('../../../lifecycle/resources.json').resources[0];

function adapter(ignoreKeyword) {
  let row;
  const m = resource.matrix;
  const call = async (method, path, body) => {
    if (method === 'POST') row = { id: 'synthetic-row', ...body };
    if (method === 'PUT') {
      if (m.invalid.some((input) => JSON.stringify(input) === JSON.stringify(body)))
        return { status: 400 };
      for (const [key, value] of Object.entries(body))
        if (typeof value !== 'string' || value.trim()) row[key] = value;
    }
    if (method === 'GET') {
      const keyword = new URL(path, 'http://synthetic.invalid').searchParams.get('keyword');
      const matches = ignoreKeyword || !keyword || row.name.includes(keyword);
      return { status: 200, data: {
        items: matches ? [{ ...row }] : [],
        pagination: { page: 1, pageSize: 20 },
      } };
    }
    return { status: 200, data: { ...row } };
  };
  return {
    call,
    good: async (...args) => (await call(...args)).data,
    snapshot: () => [{ ...row }],
  };
}
const steps = { test: async (_name, run) => run() };

test('resource matrix detects a transport that ignores keyword filtering', async () => {
  await assert.rejects(
    runResourceMatrix(steps, resource, adapter(true)),
    /nonmatching filter/,
  );
});

test('resource matrix accepts filtering that excludes a nonmatching saved row', async () => {
  await runResourceMatrix(steps, resource, adapter(false));
});
