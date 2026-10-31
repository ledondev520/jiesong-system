/** Pure rule/CLI checks for archive-test-data.js; DB behaviour is in src/integration/archive-test-data.integration.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { supplierReason, parseArgs } = require('./archive-test-data');

test('supplierReason: exact, case-sensitive markers only', () => {
  assert.equal(supplierReason({ name: '甲(存疑)' }, {}), 'doubtful');
  assert.equal(supplierReason({ name: '甲', shortName: '乙（存疑）' }, {}), 'doubtful');
  assert.equal(supplierReason({ name: 'QA-x' }, {}), 'test-data');
  assert.equal(supplierReason({ name: 'qa-x' }, {}), null);
  assert.equal(supplierReason({ name: '存疑' }, {}), null);
  assert.equal(supplierReason({ name: '甲(文件损坏)' }, {}), null);
  assert.equal(supplierReason({ name: '甲(文件损坏)' }, { includeDamaged: true }), 'damaged');
});

test('parseArgs: dry-run is the default and unknown flags are rejected', () => {
  assert.equal(parseArgs([]).confirm, false);
  assert.deepEqual(parseArgs(['--confirm', '--backup-dir=/x', '--include-damaged']), { confirm: true, includeDamaged: true, backupDir: '/x', restore: null });
  assert.equal(parseArgs(['--restore', 'r.json']).restore, 'r.json');
  assert.throws(() => parseArgs(['--force']), /Unknown option/);
});
