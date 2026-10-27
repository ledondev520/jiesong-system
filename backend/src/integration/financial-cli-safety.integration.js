/** Synthetic private SQLite/CLI fixtures only; env-file fixtures stay in os.tmpdir(), never real configuration. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const XLSX = require('xlsx');
const { applyMigrations } = require('../testHelpers/financial-library-data');
const scripts = path.resolve(__dirname, '../../scripts');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-cli-safety-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function cli(database, script, args) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...args], {
    env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: `file:${database}`,
      JWT_SECRET: 'test-only-jwt-secret-for-ci-123456' }, encoding: 'utf8', timeout: 60000,
  });
  assert.ifError(result.error);
  return result;
}
function workbook(root, month = 9) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['科目余额表'], ['合成单位', null, null, `期间：2026年${month}月-2026年${month}月`],
    ['科目', '余额'], ['1001', 12.34],
  ]), '科目余额表');
  const file = path.join(root, `合成${month}.xlsx`);
  fs.writeFileSync(file, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { mode: 0o600 });
  return file;
}
function scalar(database, sql) {
  return execFileSync('python3', ['-c', 'import sqlite3,sys;from pathlib import Path;c=sqlite3.connect(Path(sys.argv[1]).as_uri()+"?mode=ro",uri=True);print(c.execute(sys.argv[2]).fetchone()[0]);c.close()', database, sql], { encoding: 'utf8' }).trim();
}

test('all financial CLI modes reject nonexistent targets without files or mode output', t => {
  const root = fixture(t), file = workbook(root), missing = path.join(root, 'missing.sqlite');
  const before = fs.readdirSync(root).sort();
  const cases = [
    ['retain-financial-snapshots.js', [file]],
    ['retain-financial-snapshots.js', [file, '--confirm', '--backup-dir', root, '--receipt', path.join(root, 'receipt.json')]],
    ['import-financial-evidence.js', [root]],
    ['import-financial-evidence.js', [root, '--confirm']],
    ['financial-evidence-transfer.js', ['export', '--ids-file', file, '--output', path.join(root, 'bundle.json')]],
    ['financial-evidence-transfer.js', ['preview', '--bundle', file, '--plan', path.join(root, 'plan.json')]],
    ['financial-evidence-transfer.js', ['import', '--bundle', file, '--plan', file, '--confirm', '--backup-dir', root, '--receipt', path.join(root, 'receipt.json')]],
  ];
  for (const [script, args] of cases) {
    const result = cli(missing, script, args);
    assert.notEqual(result.status, 0, script);
    assert.equal(result.stdout, '', script);
    assert.deepEqual(fs.readdirSync(root).sort(), before, script);
  }
});

test('retain enforces arguments, backup, exclusive receipt, atomic batch and readable backup', t => {
  const root = fixture(t), database = path.join(root, 'synthetic.sqlite');
  applyMigrations(database);
  const file = workbook(root), receipt = path.join(root, 'receipt.json');
  const options = ['--confirm', '--backup-dir', root, '--receipt', receipt];
  for (const args of [[file, '--confirm'], [file, ...options, '--confirm'], [file, ...options, '--receipt', receipt],
    [file, ...options, '--unknown'], [file, '--confirm=yes'], [file, '--backup-dir']]) {
    assert.notEqual(cli(database, 'retain-financial-snapshots.js', args).status, 0);
  }
  assert.equal(scalar(database, 'SELECT count(*) FROM financial_evidence_documents'), '0');
  const unsafe = path.join(root, 'unsafe'); fs.mkdirSync(unsafe, { mode: 0o755 });
  assert.notEqual(cli(database, 'retain-financial-snapshots.js', [file, '--confirm', '--backup-dir', unsafe,
    '--receipt', path.join(root, 'failed.json')]).status, 0);
  assert.equal(scalar(database, 'SELECT count(*) FROM financial_evidence_documents'), '0');
  fs.writeFileSync(receipt, 'existing receipt', { mode: 0o600 });
  assert.notEqual(cli(database, 'retain-financial-snapshots.js', [file, ...options]).status, 0);
  assert.equal(fs.readFileSync(receipt, 'utf8'), 'existing receipt');
  assert.equal(scalar(database, 'SELECT count(*) FROM financial_evidence_documents'), '0');
  fs.unlinkSync(receipt);
  assert.equal(cli(database, 'retain-financial-snapshots.js', [file, ...options]).status, 0);
  const saved = JSON.parse(fs.readFileSync(receipt));
  assert.equal(saved.imported, 1); assert.equal(saved.skipped, 0);
  assert.equal(saved.documents[0].action, 'IMPORTED');
  assert.ok(saved.documents[0].id); assert.match(saved.documents[0].sourceKey, /^[a-f0-9]{64}$/);
  assert.match(saved.targetFingerprint, /^[a-f0-9]{64}$/); assert.ok(Date.parse(saved.completedAt));
  for (const output of [receipt, saved.backup]) assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.equal(scalar(saved.backup, 'PRAGMA integrity_check'), 'ok');
  assert.equal(scalar(saved.backup, 'SELECT count(*) FROM financial_evidence_documents'), '0');
  const repeat = path.join(root, 'repeat.json');
  assert.equal(cli(database, 'retain-financial-snapshots.js', [file, '--confirm', '--backup-dir', root, '--receipt', repeat]).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(repeat)).skipped, 1);
  // A later document failure must roll back the earlier new document too.
  execFileSync('python3', ['-c', `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);c.execute("CREATE TRIGGER synthetic_late_failure BEFORE INSERT ON financial_evidence_documents WHEN NEW.periodMonth=11 BEGIN SELECT RAISE(ABORT, 'synthetic rollback'); END");c.commit();c.close()`, database]);
  const ten = workbook(root, 10), eleven = workbook(root, 11);
  assert.notEqual(cli(database, 'retain-financial-snapshots.js', [ten, eleven, '--confirm', '--backup-dir', root,
    '--receipt', path.join(root, 'rollback.json')]).status, 0);
  assert.equal(scalar(database, 'SELECT count(*) FROM financial_evidence_documents'), '1');
  const twelve = workbook(root, 12);
  const failure = spawnSync(process.execPath, ['-e', `
    require('node:fs').fsyncSync = () => { throw new Error('synthetic receipt failure'); };
    require(${JSON.stringify(path.join(scripts, 'retain-financial-snapshots.js'))}).main(process.argv.slice(1))
      .catch(error => { console.error(error.code + ': ' + error.message); process.exitCode = 1; });
  `, twelve, '--confirm', '--backup-dir', root, '--receipt', path.join(root, 'committed.json')], {
    env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: `file:${database}`,
      JWT_SECRET: 'test-only-jwt-secret-for-ci-123456' }, encoding: 'utf8', timeout: 60000,
  });
  assert.ifError(failure.error); assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /FINANCE_RECEIPT_FAILED.*事务已提交/);
  assert.equal(scalar(database, 'SELECT count(*) FROM financial_evidence_documents'), '2');
});

test('readonly SQLite journal modes preserve consistent snapshots and refuse absent WAL coordination', t => {
  const root = fixture(t);
  const probe = `import importlib.util,sqlite3,sys,os,json
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('reader',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
os.umask(0o077)
root=Path(sys.argv[2]);db=root/'journal.sqlite'
c=sqlite3.connect(db)
c.executescript('CREATE TABLE financial_evidence_documents(id TEXT,sourceKey TEXT,contentSha256 TEXT,category TEXT,originalArchived INTEGER,periodId TEXT); CREATE TABLE financial_evidence_sheets(documentId TEXT,sheetIndex INTEGER);')
c.commit();c.close()
selection=[dict(sourceKey='s',contentSha256='h',category='c')]
before=sorted(os.listdir(root));assert m.read_snapshot(str(db),selection)['documents']==[];assert sorted(os.listdir(root))==before
c=sqlite3.connect(db);assert c.execute('PRAGMA journal_mode=WAL').fetchone()[0]=='wal';c.close()
before=sorted(os.listdir(root));assert before==['journal.sqlite']
try: m.read_snapshot(str(db),selection)
except (ValueError,FileNotFoundError): pass
else: raise AssertionError('dormant WAL must fail closed')
assert sorted(os.listdir(root))==before
c=sqlite3.connect(db);c.execute('PRAGMA wal_autocheckpoint=0');c.execute("INSERT INTO financial_evidence_documents VALUES ('live','s','h','c',0,NULL)");c.commit()
# The committed row is still in WAL; preview must see it while the writer stays open.
before=sorted(os.listdir(root));assert len(before)==3
snapshot=m.read_snapshot(str(db),selection);assert snapshot['documents'][0]['id']=='live';assert sorted(os.listdir(root))==before
# Both real partially-present sidecar states must fail without creating files.
import shutil
for missing in ('-wal','-shm'):
 partial=root/('missing'+missing);partial.mkdir(mode=0o700)
 target=partial/'partial.sqlite';shutil.copy2(db,target)
 keep='-shm' if missing=='-wal' else '-wal'
 shutil.copy2(str(db)+keep,str(target)+keep)
 names=sorted(os.listdir(partial))
 try: m.read_snapshot(str(target),selection)
 except (ValueError,FileNotFoundError): pass
 else: raise AssertionError('missing coordination accepted')
 assert sorted(os.listdir(partial))==names
# An active writer's uncommitted row must not leak into a reader's snapshot.
c.execute("INSERT INTO financial_evidence_documents VALUES ('pending','s','h','c',0,NULL)")
assert [d['id'] for d in m.read_snapshot(str(db),selection)['documents']]==['live']
c.rollback()
c.close()
print('rollback unchanged; dormant WAL refused; live committed WAL visible')
`;
  const result = execFileSync('python3', ['-c', probe, path.join(scripts, 'financial-evidence-readonly.py'), root], { encoding: 'utf8' });
  assert.match(result, /live committed WAL visible/);
});

test('shared SQLite identity refuses a different actual connection and broad or changed target', async t => {
  const root = fixture(t), file = path.join(root, 'synthetic.sqlite'), other = path.join(root, 'other.sqlite');
  fs.writeFileSync(file, 'synthetic identity only', { mode: 0o600 });
  fs.writeFileSync(other, 'synthetic identity only', { mode: 0o600 });
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${file}`;
  t.after(() => { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; });
  const { configuredDatabase, targetIdentity } = require('../../scripts/financial-sqlite-safety');
  const configured = configuredDatabase();
  const adapter = actual => ({ $queryRawUnsafe: async sql => {
    assert.equal(sql, 'PRAGMA database_list'); return [{ name: 'main', file: actual }];
  } });
  await assert.rejects(targetIdentity(adapter(other), configured));
  const before = await targetIdentity(adapter(file), configured);
  fs.renameSync(file, path.join(root, 'old.sqlite'));
  fs.writeFileSync(file, 'replacement', { mode: 0o600 });
  assert.notEqual((await targetIdentity(adapter(file), configured)).fingerprint, before.fingerprint);
  fs.chmodSync(file, 0o644);
  await assert.rejects(targetIdentity(adapter(file), configured));
});

test('legacy import loads DATABASE_URL from private config env before resolving the SQLite target', t => {
  const root = fixture(t), backend = path.join(root, 'backend');
  const source = path.join(root, 'empty-input');
  for (const directory of ['scripts', 'src/config', 'src/services', 'prisma']) {
    fs.mkdirSync(path.join(backend, directory), { recursive: true, mode: 0o700 });
  }
  fs.mkdirSync(source, { mode: 0o700 });
  // Config has a fixed backend/.env path: relocate actual modules, not production config.
  for (const relative of ['scripts/import-financial-evidence.js', 'scripts/financial-sqlite-safety.js',
    'src/config/index.js', 'src/config/constants.js', 'src/config/trustedProxies.js']) {
    fs.copyFileSync(path.join(scripts, '..', relative), path.join(backend, relative));
  }
  fs.symlinkSync(path.join(scripts, '../node_modules'), path.join(backend, 'node_modules'), 'dir');
  // Empty input needs no business parser. Avoid constructing Prisma or loading its env files.
  fs.writeFileSync(path.join(backend, 'src/services/financialEvidenceService.js'), 'module.exports = {};\n', { mode: 0o600 });
  const database = path.join(backend, 'prisma/synthetic.sqlite');
  execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TABLE synthetic(value TEXT)"); c.commit(); c.close()', database], { stdio: 'ignore' });
  fs.chmodSync(database, 0o600);
  const original = fs.readFileSync(database);
  const envFile = path.join(backend, '.env');
  const writeEnv = target => fs.writeFileSync(envFile,
    `DATABASE_URL=file:./${target}\nJWT_SECRET=test-only-config-fixture-never-production-123456\n`, { mode: 0o600 });
  let invocation = 0;
  const run = (confirm = false) => {
    const stdout = path.join(root, `stdout-${++invocation}.txt`), stderr = path.join(root, `stderr-${invocation}.txt`);
    const outFd = fs.openSync(stdout, 'wx', 0o600), errFd = fs.openSync(stderr, 'wx', 0o600);
    let result;
    try {
      result = spawnSync(process.execPath,
        [path.join(backend, 'scripts/import-financial-evidence.js'), source, ...(confirm ? ['--confirm'] : [])], {
          cwd: root,
          // Only the fixture config may supply DATABASE_URL/JWT_SECRET. File-backed
          // output also works in sandboxes that restrict Node child-process pipes.
          env: { PATH: process.env.PATH, NODE_ENV: 'production' },
          stdio: ['ignore', outFd, errFd], timeout: 10000,
        });
    } finally { fs.closeSync(outFd); fs.closeSync(errFd); }
    return { ...result, stdout: fs.readFileSync(stdout, 'utf8'), stderr: fs.readFileSync(stderr, 'utf8') };
  };
  writeEnv('synthetic.sqlite');
  const existing = run();
  assert.ifError(existing.error);
  assert.equal(existing.status, 0, existing.stderr);
  assert.equal(JSON.parse(existing.stdout).mode, 'dry-run');
  assert.equal(JSON.parse(existing.stdout).eligibleDocuments, 0);
  assert.deepEqual(fs.readFileSync(database), original);
  writeEnv('missing.sqlite');
  const before = fs.readdirSync(path.join(backend, 'prisma')).sort();
  for (const confirm of [false, true]) {
    const missing = run(confirm);
    assert.ifError(missing.error);
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout, '');
    assert.equal(fs.existsSync(path.join(backend, 'prisma/missing.sqlite')), false);
    assert.deepEqual(fs.readdirSync(path.join(backend, 'prisma')).sort(), before);
  }
});
