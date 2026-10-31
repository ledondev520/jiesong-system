/** Synthetic private SQLite built from the committed migrations; runs the real backfill CLI. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { applyMigrations } = require('../testHelpers/financial-library-data');

const script = path.resolve(__dirname, '../../scripts/backfill-default-customer.js');
const PY = `import json,sqlite3,sys
c=sqlite3.connect(sys.argv[1])
mode=sys.argv[2]
if mode=='seed':
    c.executescript("""
    INSERT INTO ports(id,name,code,updatedAt) VALUES('p1','SynthPort','SP',CURRENT_TIMESTAMP);
    INSERT INTO customers(id,name,updatedAt) VALUES('c-other','SynthOther',CURRENT_TIMESTAMP);
    INSERT INTO stores(id,name,portId,isActive,updatedAt) VALUES('s1','SynthStoreA','p1',1,CURRENT_TIMESTAMP),('s2','SynthStoreB','p1',0,CURRENT_TIMESTAMP);
    INSERT INTO stores(id,name,portId,customerId,updatedAt) VALUES('s3','SynthStoreC','p1','c-other',CURRENT_TIMESTAMP);
    INSERT INTO sales_contracts(id,contractNo,exchangeRate,updatedAt) VALUES('o1','EXP-SYNTH-1',7,CURRENT_TIMESTAMP),('o2','EXP-SYNTH-2',7,CURRENT_TIMESTAMP);
    INSERT INTO sales_contracts(id,contractNo,exchangeRate,customerId,updatedAt) VALUES('o3','EXP-SYNTH-3',7,'c-other',CURRENT_TIMESTAMP);
    """)
    c.commit()
else:
    out={t:c.execute(f'select * from {t} order by id').fetchall() for t in ('customers','stores','sales_contracts')}
    print(json.dumps(out,default=str))
`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-customer-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const database = path.join(root, 'synthetic.sqlite');
  applyMigrations(database);
  execFileSync('python3', ['-c', PY, database, 'seed']);
  const backups = path.join(root, 'backups');
  fs.mkdirSync(backups, { mode: 0o700 });
  return { root, database, backups };
}
const snapshot = (database) => execFileSync('python3', ['-c', PY, database, 'read'], { encoding: 'utf8' });
function run(args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 60000,
  });
  assert.ifError(result.error);
  return result;
}
const base = (f) => ['--database', f.database, '--customer-name', 'SynthSeapot'];
const confirm = (f, name) => [...base(f), '--confirm', '--backup-dir', f.backups, '--receipt', path.join(f.root, name)];

test('dry-run reports counts and writes nothing (no backup, no receipt)', (t) => {
  const f = fixture(t), before = snapshot(f.database);
  const result = run(base(f));
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.mode, 'dry-run');
  assert.equal(out.customerCreated, true);
  assert.equal(out.storesLinked, 2);
  assert.equal(out.salesContractsLinked, 2);
  assert.equal(snapshot(f.database), before);
  assert.deepEqual(fs.readdirSync(f.backups), []);
});

test('confirm links NULL rows only, backs up, writes a private receipt and prints no names; second run is a no-op', (t) => {
  const f = fixture(t), receipt = path.join(f.root, 'receipt.json');
  const result = run(confirm(f, 'receipt.json'));
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.mode, 'confirm');
  assert.equal(out.customerCreated, true);
  assert.equal(out.storesLinked, 2);
  assert.equal(out.salesContractsLinked, 2);
  for (const name of ['SynthSeapot', 'SynthStore', 'SynthOther', 'EXP-SYNTH']) assert.ok(!result.stdout.includes(name), name);

  const data = JSON.parse(snapshot(f.database));
  assert.equal(data.customers.length, 2);
  const created = data.customers.find((row) => row[1] === 'SynthSeapot');
  assert.equal(created[0], out.customerId);
  assert.equal(created[8], 'USD');
  assert.equal(created[9], 'FOB');
  const storeCols = ['id', 'name', 'portId', 'contactName', 'contactPhone', 'contactEmail', 'address', 'isActive', 'createdAt', 'updatedAt', 'customerId', 'code', 'legalName'];
  const stores = data.stores.map((row) => Object.fromEntries(storeCols.map((c, i) => [c, row[i]])));
  assert.deepEqual(stores.map((s) => s.customerId), [out.customerId, out.customerId, 'c-other']); // inactive s2 linked, pre-linked s3 untouched
  assert.ok(stores.every((s) => s.code === null && s.legalName === null));
  // sales_contracts column order after migration A: customerId=23, currency=24, incoterm=25, paymentTerms=26, portOfLoading=27
  assert.deepEqual(data.sales_contracts.map((row) => row[0]), ['o1', 'o2', 'o3']);
  assert.deepEqual(data.sales_contracts.map((row) => row[23]), [out.customerId, out.customerId, 'c-other']);
  assert.ok(data.sales_contracts.every((row) => row[24] === 'USD' && row[25] === null && row[26] === null && row[27] === null)); // old order terms not rewritten

  assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
  const saved = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(saved.customerId, out.customerId);
  assert.equal(saved.backupPath, out.backupPath);
  const backups = fs.readdirSync(f.backups);
  assert.equal(backups.length, 1);
  assert.equal(fs.statSync(path.join(f.backups, backups[0])).mode & 0o777, 0o600);

  const again = run(confirm(f, 'receipt2.json'));
  assert.equal(again.status, 0, again.stderr);
  const second = JSON.parse(again.stdout);
  assert.equal(second.customerCreated, false);
  assert.equal(second.customerId, out.customerId);
  assert.equal(second.storesLinked, 0);
  assert.equal(second.salesContractsLinked, 0);
  assert.equal(snapshot(f.database), JSON.stringify(data));
});

test('missing --backup-dir/--receipt with --confirm fails before the database is opened', (t) => {
  const f = fixture(t), missing = path.join(f.root, 'missing.sqlite');
  const result = run(['--database', missing, '--customer-name', 'SynthSeapot', '--confirm']);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.ok(!fs.existsSync(missing));
});

test('an existing receipt path is never overwritten and nothing is written', (t) => {
  const f = fixture(t), before = snapshot(f.database);
  fs.writeFileSync(path.join(f.root, 'receipt.json'), 'keep', { mode: 0o600 });
  const result = run(confirm(f, 'receipt.json'));
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(path.join(f.root, 'receipt.json'), 'utf8'), 'keep');
  assert.equal(snapshot(f.database), before);
});
