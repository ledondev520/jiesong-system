const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments } = require('./rematch-auto-invoices');

const base = ['--database', '/private/app.db'];

test('rematch CLI: no flags is a dry run; apply needs backup dir and receipt together', () => {
  assert.equal(parseArguments(base).apply, false);
  assert.equal(parseArguments([...base, '--apply', '--backup-dir', '/b', '--receipt', '/r.json']).apply, true);
  assert.throws(() => parseArguments([...base, '--apply']), /参数不完整/);
  assert.throws(() => parseArguments([...base, '--apply', '--backup-dir', '/b']), /参数不完整/);
  assert.throws(() => parseArguments([...base, '--receipt', '/r.json']), /参数不完整/);
});

test('rematch CLI: rejects relative paths, missing database, duplicates and unknown flags', () => {
  assert.throws(() => parseArguments(['--database', 'rel.db']), /参数不完整/);
  assert.throws(() => parseArguments([...base, '--report', 'rel.json']), /参数不完整/);
  assert.throws(() => parseArguments([]), /参数不完整/);
  assert.throws(() => parseArguments([...base, ...base]), /参数无效/);
  assert.throws(() => parseArguments([...base, '--apply=1']), /参数无效/);
});
