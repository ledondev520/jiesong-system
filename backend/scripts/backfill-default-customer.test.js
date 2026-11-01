const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments } = require('./backfill-default-customer');

const base = ['--database', '/abs/app.db', '--customer-name', 'Seapot'];

test('dry-run is the default and needs no backup arguments', () => {
  assert.deepEqual(parseArguments(base), { database: '/abs/app.db', customerName: 'Seapot', confirm: false, backupDir: undefined, receipt: undefined });
  assert.equal(parseArguments([...base, '--dry-run']).confirm, false);
});

test('customer name defaults to Seapot but an explicit blank is rejected', () => {
  assert.equal(parseArguments(['--database', '/a.db']).customerName, 'Seapot');
  assert.equal(parseArguments(['--database', '/a.db', '--customer-name', ' Other ']).customerName, 'Other');
});

test('confirm requires both --backup-dir and --receipt', () => {
  const ok = parseArguments([...base, '--confirm', '--backup-dir', '/b', '--receipt', '/r.json']);
  assert.equal(ok.confirm, true);
  assert.throws(() => parseArguments([...base, '--confirm']));
  assert.throws(() => parseArguments([...base, '--confirm', '--backup-dir', '/b']));
  assert.throws(() => parseArguments([...base, '--confirm', '--receipt', '/r.json']));
});

test('rejects backup args without confirm, dry-run with confirm, relative or missing database, bad names and repeats', () => {
  assert.throws(() => parseArguments([...base, '--backup-dir', '/b']));
  assert.throws(() => parseArguments([...base, '--dry-run', '--confirm', '--backup-dir', '/b', '--receipt', '/r']));
  assert.throws(() => parseArguments(['--database', 'rel.db', '--customer-name', 'Seapot']));
  assert.throws(() => parseArguments(['--database', '/a.db?x=1', '--customer-name', 'Seapot']));
  assert.throws(() => parseArguments(['--customer-name', 'Seapot']));
  assert.throws(() => parseArguments(['--database', '/a.db', '--customer-name', '  ']));
  assert.throws(() => parseArguments([...base, '--database', '/other.db']));
  assert.throws(() => parseArguments([...base, '--unknown']));
  assert.throws(() => parseArguments([...base, '--receipt']));
});
