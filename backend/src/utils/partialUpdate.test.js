const test = require('node:test');
const assert = require('node:assert/strict');
const { partialUpdate } = require('./partialUpdate');
const fields = {
  name: { type: 'string', required: true },
  contact: { type: 'string', nullable: true },
  active: { type: 'boolean' },
  quantity: { type: 'number' },
};

test('partial updates retain omitted, undefined and blank fields and only null clears', () => {
  const stored = { name: 'Saved', contact: 'Saved contact', active: true, quantity: 7 };
  for (const input of [{}, { contact: undefined }, { contact: '' }, { contact: '   ' }]) {
    assert.deepEqual({ ...stored, ...partialUpdate(input, fields) }, stored);
  }
  assert.deepEqual({ ...stored, ...partialUpdate({ contact: null, active: false, quantity: 0 }, fields) }, {
    name: 'Saved', contact: null, active: false, quantity: 0,
  });
});

test('partial updates use an own-field whitelist and trim text without coercing invalid types', () => {
  const input = Object.assign(Object.create({ contact: 'inherited' }), { name: ' Trimmed ', role: 'ADMIN' });
  assert.deepEqual(partialUpdate(input, fields), { name: 'Trimmed' });
  for (const input of [{ name: null }, { name: ' ' }, { name: 1 }, { contact: {} }, { active: 'false' }]) {
    assert.throws(() => partialUpdate(input, fields), { statusCode: 400 });
  }
});
