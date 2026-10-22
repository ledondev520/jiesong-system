/**
 * Input: 隔离合成SQLite、已提交迁移、真实导出/预检/导入CLI
 * Output: 选择性导出、跨库主键映射、在线备份、旧数据不变、幂等/冲突/回滚验收
 * Pos: 跨机资料迁移集成测试；不访问业务数据库、SSH或线上服务
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { applyMigrations, readDatabase } = require('../testHelpers/financial-library-data');
const transfer = require('../services/financialEvidenceTransferService');

test('SQLite/CLI: selected financial evidence transfers append-only with actual-target backup', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-evidence-transfer-'));
  fs.chmodSync(root, 0o700);
  const sourceDir = path.join(root, 'source'), targetDir = path.join(root, 'target'), backupDir = path.join(root, 'backups');
  for (const directory of [sourceDir, targetDir, backupDir]) fs.mkdirSync(directory, { mode: 0o700 });
  const sourcePath = path.join(sourceDir, 'synthetic.db'), targetPath = path.join(targetDir, 'synthetic.db');
  applyMigrations(sourcePath); applyMigrations(targetPath);
  process.env.DATABASE_URL = `file:${sourcePath}`;
  const source = new PrismaClient({ datasources: { db: { url: `file:${sourcePath}` } }, log: [] });
  const target = new PrismaClient({ datasources: { db: { url: `file:${targetPath}` } }, log: [] });
  await target.$queryRawUnsafe('PRAGMA journal_mode=WAL');
  const evidence = require('../services/financialEvidenceService');
  t.after(async () => { await source.$disconnect(); await target.$disconnect(); await require('../utils/prisma').$disconnect(); fs.rmSync(root, { recursive: true, force: true }); });
  const makeBook = sheets => {
    const book = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  };
  const docs = [
    makeBook(Object.fromEntries(['资产负债表', '利润表', '现金流量表'].map(name => [name, [[name], ['合成单位', '2026-09'], ['项目', '金额'], ['合成额', 0]]]))),
    makeBook({ 科目余额表: [['科目余额表'], ['合成单位', null, null, '期间：2026年9月-2026年9月'], ['科目', '余额'], ['1001', -12.34]] }),
    makeBook({ 明细账: [['明细账'], ['合成单位', null, null, '期间：2026年1月-2026年9月'], ['科目编码', '科目名称', '日期', '凭证号', '摘要', '借方', '贷方', '方向', '余额'], ['1001', '现金', '2026-01-02', 'TEST-1', '合成交易', 100, null, '借', 100], ['1001', '现金', '2026-09-30', 'TEST-2', '合成交易', null, 25.5, '借', 74.5]] }),
  ].map((buffer, index) => evidence.parseFinancialEvidenceSnapshot({ buffer, fileName: `合成${index}.xlsx` }));
  const taxDoc = () => ({
    sourceKey: 'a'.repeat(64), contentSha256: 'b'.repeat(64), parseVersion: 'manual-tax-reconciliation-v1',
    relativePath: '合成/核验.md', fileName: '合成税费核验.md', fileSize: 10, category: 'TAX_RECONCILIATION',
    categoryLabel: '税费核验记录（非申报回执）', analysisScope: 'TAX', periodYear: 2026, periodMonth: 9,
    sourceSheetCount: 0, importedSheetCount: 1, rowCount: 1, numericCellCount: 1, textCellCount: 2, redactionCount: 0, originalArchived: false,
    sheets: [{ sheetIndex: 0, sheetName: '税费核验', sourceRange: null, rowCount: 1, columnCount: 3,
      nonEmptyCellCount: 3, formulaCellCount: 0, numericCellCount: 1, textCellCount: 2, redactionCount: 0,
      rows: [{ sourceRow: 1, rowKind: 'DATA', valuesJson: '["合成税费",12.34,"未确认申报或缴款"]', searchText: '合成税费 12.34 未确认申报或缴款', numericCellCount: 1, textCellCount: 2, redactionCount: 0 }] }],
  });
  const sourcePeriod = await source.financialPeriod.create({ data: { year: 2026, month: 9, periodLabel: '合成来源账期', reportDate: new Date('2026-09-30') } });
  const targetPeriod = await target.financialPeriod.create({ data: { year: 2026, month: 9, periodLabel: '合成目标已有账期', reportDate: new Date('2026-09-30') } });
  await target.balanceSheetEntry.create({ data: { periodId: targetPeriod.id, totalAssets: 777 } });
  await source.user.create({ data: { username: 'synthetic-private-user', name: '合成用户', role: 'ADMIN', password: 'DO-NOT-EXPORT-SYNTHETIC-CREDENTIAL' } });
  const selected = (await evidence.appendFinancialEvidenceSnapshots(docs, source)).documents.map(d => d.id);
  selected.push((await evidence.importFinancialEvidenceDocuments([taxDoc()], source)).documents[0].id);
  const sentinel = taxDoc(); sentinel.sourceKey = 'c'.repeat(64); sentinel.contentSha256 = 'd'.repeat(64);
  await evidence.importFinancialEvidenceDocuments([sentinel], source);
  await evidence.importFinancialEvidenceDocuments([sentinel], target);
  const sourceBefore = readDatabase(sourceDir), targetBefore = readDatabase(targetDir);
  const save = (name, value) => { const file = path.join(root, name); fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); return file; };
  const idsFile = save('ids.json', selected), bundleFile = path.join(root, 'bundle.json'), planFile = path.join(root, 'target-plan.json');
  const cli = (database, args) => spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/financial-evidence-transfer.js'), ...args], {
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, NODE_ENV: 'test', DATABASE_URL: `file:${database}`, JWT_SECRET: 'test-only-transfer-never-production-123456' },
    encoding: 'utf8', timeout: 60000,
  });
  const ok = result => { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout.trim()); };
  let bundle;

  await t.test('export includes exactly four requested documents with no local DB keys or credentials, and source remains unchanged', () => {
    assert.equal(ok(cli(sourcePath, ['export', '--ids-file', idsFile, '--output', bundleFile])).documents, 4);
    bundle = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
    assert.equal(bundle.documents.length, 4);
    assert.equal(bundle.documents.filter(d => d.category === 'TAX_RECONCILIATION').length, 1);
    assert.doesNotMatch(fs.readFileSync(bundleFile, 'utf8'), /DO-NOT-EXPORT|synthetic-private-user|"periodId"|"sheetId"|"documentId"|"password"/);
    assert.equal(fs.statSync(bundleFile).mode & 0o777, 0o600);
    assert.deepEqual(readDatabase(sourceDir), sourceBefore);
    const bytes = fs.readFileSync(bundleFile);
    assert.notEqual(cli(sourcePath, ['export', '--ids-file', idsFile, '--output', bundleFile]).status, 0);
    assert.deepEqual(fs.readFileSync(bundleFile), bytes);
  });

  await t.test('preview does not write; import requires confirm and a plan made against this exact target', () => {
    const preview = ok(cli(targetPath, ['preview', '--bundle', bundleFile, '--plan', planFile]));
    assert.equal(preview.readOnlyConnection, true);
    assert.equal(preview.toCreate, 4); assert.equal(preview.toSkip, 0);
    assert.deepEqual(readDatabase(targetDir), targetBefore);
    assert.notEqual(cli(targetPath, ['import', '--bundle', bundleFile, '--plan', planFile, '--backup-dir', backupDir, '--receipt', path.join(root, 'no-confirm.json')]).status, 0);
    const wrongPlan = path.join(root, 'source-plan.json');
    ok(cli(sourcePath, ['preview', '--bundle', bundleFile, '--plan', wrongPlan]));
    assert.notEqual(cli(targetPath, ['import', '--bundle', bundleFile, '--plan', wrongPlan, '--backup-dir', backupDir, '--receipt', path.join(root, 'wrong-target.json'), '--confirm']).status, 0);
    assert.deepEqual(readDatabase(targetDir), targetBefore);
  });

  await t.test('readonly preflight connection rejects an injected write at the SQLite layer', () => {
    const probe = `import importlib.util,sqlite3,sys,json
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('reader',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
original=sqlite3.connect
blocked=[]
class Probe(sqlite3.Connection):
 def execute(self,sql,*args):
  result=super().execute(sql,*args)
  if sql=='BEGIN':
   try: super().execute('CREATE TABLE must_not_write(value TEXT)')
   except sqlite3.DatabaseError: blocked.append(True)
   else: raise AssertionError('Readonly connection accepted a write')
  return result
sqlite3.connect=lambda *args,**kwargs: original(*args,**kwargs,factory=Probe)
result=module.read_snapshot(sys.argv[2],json.loads(sys.stdin.read()))
assert blocked==[True] and result['readOnly'] is True
print('SQLite write rejected')
`;
    const output = execFileSync('python3', ['-c', probe, path.resolve(__dirname, '../../scripts/financial-evidence-readonly.py'), targetPath], {
      input: JSON.stringify(bundle.documents.map(({ sourceKey, contentSha256, category }) => ({ sourceKey, contentSha256, category }))), encoding: 'utf8',
    });
    assert.match(output, /SQLite write rejected/);
    assert.deepEqual(readDatabase(targetDir), targetBefore);
  });

  await t.test('confirmed import creates a verified online backup and only appends evidence, mapping monthly links to target IDs', async () => {
    const receiptPath = path.join(root, 'receipt.json');
    assert.equal(ok(cli(targetPath, ['import', '--bundle', bundleFile, '--plan', planFile, '--backup-dir', backupDir, '--receipt', receiptPath, '--confirm'])).imported, 4);
    const receipt = JSON.parse(fs.readFileSync(receiptPath));
    assert.equal(receipt.replaced, 0);
    assert.equal(fs.statSync(receipt.backup).mode & 0o777, 0o600);
    assert.equal(execFileSync('python3', ['-c', 'import sqlite3,sys;c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True);print(c.execute("PRAGMA integrity_check").fetchone()[0]);print(c.execute("SELECT count(*) FROM financial_evidence_documents").fetchone()[0])', receipt.backup], { encoding: 'utf8' }).trim(), 'ok\n1');
    const after = readDatabase(targetDir);
    for (const [table, rows] of Object.entries(targetBefore)) {
      if (table.startsWith('financial_evidence_')) {
        const ids = new Set(rows.map(row => row.id));
        assert.deepEqual(after[table].filter(row => ids.has(row.id)), rows);
      } else assert.deepEqual(after[table], rows);
    }
    const migrated = await target.financialEvidenceDocument.findMany({ where: { sourceKey: { in: docs.map(d => d.sourceKey) } } });
    for (const doc of migrated) assert.equal(doc.periodId, doc.category.includes('CUMULATIVE') ? null : targetPeriod.id);
    assert.notEqual(sourcePeriod.id, targetPeriod.id);
    const ids = (await target.financialEvidenceDocument.findMany({ where: { sourceKey: { in: bundle.documents.map(d => d.sourceKey) } } })).map(d => d.id);
    assert.deepEqual(await transfer.exportBundle(ids, target), bundle);
    assert.deepEqual(readDatabase(sourceDir), sourceBefore);
  });

  await t.test('repeat skips all records; a stale create-plan or conflicting existing row fails without writes', async () => {
    const after = readDatabase(targetDir);
    const args = ['import', '--bundle', bundleFile, '--plan', planFile, '--backup-dir', backupDir, '--receipt', path.join(root, 'stale.json'), '--confirm'];
    assert.notEqual(cli(targetPath, args).status, 0);
    assert.deepEqual(readDatabase(targetDir), after);
    const repeatPlan = path.join(root, 'repeat-plan.json');
    assert.equal(ok(cli(targetPath, ['preview', '--bundle', bundleFile, '--plan', repeatPlan])).toSkip, 4);
    const repeat = ok(cli(targetPath, ['import', '--bundle', bundleFile, '--plan', repeatPlan, '--backup-dir', backupDir, '--receipt', path.join(root, 'repeat-receipt.json'), '--confirm']));
    assert.equal(repeat.skipped, 4); assert.equal(repeat.backupCreated, false);
    assert.deepEqual(readDatabase(targetDir), after);
    const changed = structuredClone(bundle.documents);
    changed.find(d => d.category === 'TAX_RECONCILIATION').sheets[0].rows[0].values[1] = 99;
    const conflict = save('conflict.json', transfer.createBundle(changed));
    assert.notEqual(cli(targetPath, ['preview', '--bundle', conflict, '--plan', path.join(root, 'conflict-plan.json')]).status, 0);
    assert.deepEqual(readDatabase(targetDir), after);
    const cumulative = await target.financialEvidenceDocument.findFirst({ where: { category: 'GENERAL_LEDGER_CUMULATIVE_SNAPSHOT' } });
    await target.financialEvidenceDocument.update({ where: { id: cumulative.id }, data: { periodId: targetPeriod.id } });
    const wrongLink = readDatabase(targetDir);
    assert.notEqual(cli(targetPath, ['preview', '--bundle', bundleFile, '--plan', path.join(root, 'wrong-link-plan.json')]).status, 0);
    assert.deepEqual(readDatabase(targetDir), wrongLink);
    await target.financialEvidenceDocument.update({ where: { id: cumulative.id }, data: { periodId: null } });
  });

  await t.test('late row failure rolls back all newly created documents; backup failure refuses any inserts', async () => {
    const changed = structuredClone(bundle.documents);
    changed.forEach((doc, i) => { doc.sourceKey = String(i + 3).repeat(64); doc.contentSha256 = String(i + 3).repeat(64); });
    // 排序后让最后一份资料触发失败，检验前面成功插入的文档也被回滚。
    const lastRow = changed.at(-1).sheets[0].rows[0];
    lastRow.values[0] = 'FAIL-TRANSFER';
    const revisedFile = save('revised.json', transfer.createBundle(changed));
    const revisedPlan = path.join(root, 'revised-plan.json');
    ok(cli(targetPath, ['preview', '--bundle', revisedFile, '--plan', revisedPlan]));
    const before = readDatabase(targetDir);
    const unsafe = path.join(root, 'unsafe-backups'); fs.mkdirSync(unsafe, { mode: 0o755 });
    assert.notEqual(cli(targetPath, ['import', '--bundle', revisedFile, '--plan', revisedPlan, '--backup-dir', unsafe, '--receipt', path.join(root, 'bad-backup.json'), '--confirm']).status, 0);
    assert.deepEqual(readDatabase(targetDir), before);
    await target.$executeRawUnsafe(`CREATE TRIGGER synthetic_transfer_failure BEFORE INSERT ON financial_evidence_rows WHEN NEW.searchText LIKE '%FAIL-TRANSFER%' BEGIN SELECT RAISE(ABORT, 'synthetic transfer rollback'); END`);
    assert.notEqual(cli(targetPath, ['import', '--bundle', revisedFile, '--plan', revisedPlan, '--backup-dir', backupDir, '--receipt', path.join(root, 'rollback.json'), '--confirm']).status, 0);
    assert.deepEqual(readDatabase(targetDir), before);
    await target.$executeRawUnsafe('DROP TRIGGER synthetic_transfer_failure');
  });

  await t.test('tampered package, broad permissions, symlink and nonexistent target all fail closed', () => {
    const before = readDatabase(targetDir);
    const tampered = structuredClone(bundle); tampered.documents[0].fileName = '篡改.xlsx';
    const tamperedFile = save('tampered.json', tampered);
    assert.notEqual(cli(targetPath, ['preview', '--bundle', tamperedFile, '--plan', path.join(root, 'bad-plan.json')]).status, 0);
    const unsafe = save('unsafe.json', bundle); fs.chmodSync(unsafe, 0o644);
    assert.notEqual(cli(targetPath, ['preview', '--bundle', unsafe, '--plan', path.join(root, 'unsafe-plan.json')]).status, 0);
    const link = path.join(root, 'link.json'); fs.symlinkSync(bundleFile, link);
    assert.notEqual(cli(targetPath, ['preview', '--bundle', link, '--plan', path.join(root, 'link-plan.json')]).status, 0);
    const missing = path.join(root, 'missing.db');
    assert.notEqual(cli(missing, ['preview', '--bundle', bundleFile, '--plan', path.join(root, 'missing-plan.json')]).status, 0);
    assert.equal(fs.existsSync(missing), false);
    assert.deepEqual(readDatabase(targetDir), before);
  });
});
