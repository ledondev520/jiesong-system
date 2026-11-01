/** Real CLI on a private synthetic SQLite: dry-run writes nothing; confirm fills only EMPTY canonical keys from the legacy text, keeps the
 *  legacy row, backs up first, leaves a 0600 receipt, prints field names only (never values); a second run is a no-op. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { applyMigrations } = require('../testHelpers/financial-library-data');
const { parseArguments } = require('../../scripts/migrate-invoice-title-to-company-info');

const script = path.resolve(__dirname, '../../scripts/migrate-invoice-title-to-company-info.js');
const LEGACY = '公司名称：合成旧抬头公司\n纳税人识别号：91-LEGACY-001\n地址电话：1 Legacy Road\n开户行及账号：Legacy Bank 000-LEGACY-ACCT';
const PY = `import json,sqlite3,sys
c=sqlite3.connect(sys.argv[1])
if sys.argv[2]=='seed':
    c.execute("INSERT INTO system_configs(id,key,value,updatedAt) VALUES('l','invoiceTitleInfo',?,0)",(json.dumps(sys.argv[3]),))
    c.execute("INSERT INTO system_configs(id,key,value,updatedAt) VALUES('n','companyName',?,0)",(json.dumps('Canonical Co'),))
    c.commit()
else:
    print(json.dumps(sorted(c.execute('select key,value from system_configs').fetchall())))
`;
const read = (database) => JSON.parse(execFileSync('python3', ['-c', PY, database, 'read'], { encoding: 'utf8' }));
const run = (args) => spawnSync(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 60000 });

test('argument rules', () => {
  assert.equal(parseArguments(['--database', '/a.db']).confirm, false);
  assert.throws(() => parseArguments(['--database', '/a.db', '--confirm']));
  assert.throws(() => parseArguments(['--database', 'rel.db']));
  assert.throws(() => parseArguments(['--database', '/a.db', '--backup-dir', '/b']));
  assert.equal(parseArguments(['--database', '/a.db', '--confirm', '--backup-dir', '/b', '--receipt', '/r']).confirm, true);
});

test('dry-run is read-only; confirm fills only empty canonical keys, keeps the legacy row, and never prints values', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-title-migration-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const database = path.join(root, 'synthetic.sqlite');
  applyMigrations(database);
  execFileSync('python3', ['-c', PY, database, 'seed', LEGACY]);
  const backups = path.join(root, 'backups');
  fs.mkdirSync(backups, { mode: 0o700 });
  const before = JSON.stringify(read(database));

  const dry = run(['--database', database]);
  assert.equal(dry.status, 0, dry.stderr);
  const dryOut = JSON.parse(dry.stdout);
  assert.deepEqual(dryOut.fill.sort(), ['address', 'bank', 'taxId']); // name already set → untouched
  assert.equal(JSON.stringify(read(database)), before);
  assert.deepEqual(fs.readdirSync(backups), []);

  const receipt = path.join(root, 'receipt.json');
  const done = run(['--database', database, '--confirm', '--backup-dir', backups, '--receipt', receipt]);
  assert.equal(done.status, 0, done.stderr);
  for (const secret of ['LEGACY-ACCT', '91-LEGACY-001', 'Legacy Road', 'Canonical Co']) assert.equal(done.stdout.includes(secret), false, secret);
  const rows = Object.fromEntries(read(database).map(([key, value]) => [key, JSON.parse(value)]));
  assert.equal(rows.companyName, 'Canonical Co');
  assert.equal(rows.companyTaxId, '91-LEGACY-001');
  assert.equal(rows.companyAddress, '1 Legacy Road');
  assert.equal(rows.companyBankInfo, 'Legacy Bank 000-LEGACY-ACCT');
  assert.equal(rows.invoiceTitleInfo, LEGACY); // alias row kept
  assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(backups).length, 1);

  const again = run(['--database', database, '--confirm', '--backup-dir', backups, '--receipt', path.join(root, 'receipt2.json')]);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(JSON.parse(again.stdout).fill, []);
});

test('missing backup args fail before the database is opened', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-title-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const missing = path.join(root, 'missing.sqlite');
  const result = run(['--database', missing, '--confirm']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(missing), false);
});
