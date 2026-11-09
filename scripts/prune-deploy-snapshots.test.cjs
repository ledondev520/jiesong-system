const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, rmSync, utimesSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, 'prune-deploy-snapshots.sh');
const auto = n => `auto-premigrate-abc1234-202611${String(n).padStart(2, '0')}T000000Z`;
const autos = count => Array.from({ length: count }, (_, i) => auto(i + 1));

function backupRoot(t, names) {
  const root = mkdtempSync(path.join(tmpdir(), 'prune-snapshots-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of names) {
    mkdirSync(path.join(root, name));
    writeFileSync(path.join(root, name, 'premigrate.db'), 'synthetic');
  }
  return root;
}
const prune = root => spawnSync('/bin/bash', [script, root], { encoding: 'utf8' });

test('keeps the newest 12 auto snapshots, ordered by the name timestamp and not mtime', t => {
  const names = autos(15);
  const root = backupRoot(t, names);
  // The oldest names get the newest mtimes, so mtime ordering would delete the wrong ones.
  names.forEach((name, i) => utimesSync(path.join(root, name), new Date(2030, 0, 30 - i), new Date(2030, 0, 30 - i)));
  const result = prune(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(root).sort(), names.slice(3));
});

test('never touches manual pre-* backups or anything that is not an exact snapshot dir', t => {
  const manual = ['pre-abc1234-20250101T000000Z', 'pre-A92-20261109-170254', 'pre-ad6d4d3-20261101-000000', 'auto-premigrate-notes', 'auto-premigrate-abc1234-20261101T000000Z.keep'];
  const root = backupRoot(t, [...autos(14), ...manual]);
  const target = mkdtempSync(path.join(tmpdir(), 'prune-link-target-'));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  const link = 'auto-premigrate-abc1234-20250101T000000Z';
  symlinkSync(target, path.join(root, link));
  const file = 'auto-premigrate-abc1234-20250102T000000Z';
  writeFileSync(path.join(root, file), 'not a directory');
  const result = prune(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(root).sort(), [...autos(14).slice(2), ...manual, link, file].sort());
  assert.ok(existsSync(target), 'symlink target must survive');
});

test('is a no-op with fewer than 13 auto snapshots, and removes only the oldest at 13', t => {
  for (const count of [0, 1, 12]) {
    const root = backupRoot(t, [...autos(count), 'pre-manual']);
    const result = prune(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(readdirSync(root).length, count + 1, `count ${count}`);
  }
  const root = backupRoot(t, autos(13));
  assert.equal(prune(root).status, 0);
  assert.deepEqual(readdirSync(root).sort(), autos(13).slice(1));
});

test('a missing backup root fails without deleting anything', t => {
  const root = backupRoot(t, autos(13));
  assert.equal(prune(path.join(root, 'absent')).status, 2);
  assert.equal(readdirSync(root).length, 13);
});
