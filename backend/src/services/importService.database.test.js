/**
 * Input: 隔离SQLite库、合成CSV、历史导入服务
 * Output: 非唯一名称匹配、真实导入计数与单行事务回归
 * Pos: 仅在临时目录建立合成数据库，不连接业务数据
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

test('历史CSV导入遵守当前唯一键并按行回滚失败写入', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-import-'));
  fs.chmodSync(dir, 0o700);
  const dbPath = path.join(dir, 'test.db');
  const databaseUrl = `file:${dbPath}`;
  const root = path.resolve(__dirname, '../..');
  let db;
  try {
    const ddl = execFileSync(path.join(root, 'node_modules/.bin/prisma'), [
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script',
    ], { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' });
    execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbPath], { input: ddl });
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('./importService'), 'utf8'), {
      module, exports: module.exports,
      require: (name) => name === '../utils/prisma' ? db : require(name),
    });
    const service = module.exports;
    await db.port.create({ data: { name: '合成港', code: 'LA' } });
    const csvPath = path.join(dir, 'synthetic.csv');
    const run = async (rows) => {
      fs.writeFileSync(csvPath, '供应商,门店,港口,报关名,单位,柜子编号,报关数量,箱数,出货日期\n' + rows.join('\n'), { mode: 0o600 });
      return service.importCSVData(csvPath, 'synthetic-admin');
    };
    await t.test('按名称查找后以id更新或新建，供应商商品及装箱记录实际落库', async () => {
      const result = await run(['合成供应商,合成门店,合成港,合成商品,件,EXP-TEST-1,10,1,2026-01-01']);
      assert.equal(result.successRows, 1);
      assert.equal(result.failedRows, 0);
      assert.equal(await db.supplier.count({ where: { name: '合成供应商' } }), 1);
      assert.equal(await db.product.count({ where: { customsName: '合成商品' } }), 1);
      assert.equal(await db.packingItem.count(), 1);
      const repeat = await run(['合成供应商,合成门店,合成港,合成商品,箱,EXP-TEST-2,20,2,2026-01-01']);
      assert.equal(repeat.successRows, 1);
      assert.equal(await db.supplier.count({ where: { name: '合成供应商' } }), 1);
      assert.equal(await db.product.count({ where: { customsName: '合成商品' } }), 1);
      assert.equal((await db.product.findFirst({ where: { customsName: '合成商品' } })).unit, '箱');
    });
    await t.test('重名供应商或商品拒绝自动选择，不虚报成功', async () => {
      await db.supplier.createMany({ data: [{ name: '合成重名供应商' }, { name: '合成重名供应商' }] });
      const supplierResult = await run(['合成重名供应商,,,不可创建商品,件,,1,1,']);
      assert.equal(supplierResult.successRows, 0);
      assert.equal(supplierResult.failedRows, 1);
      assert.match(supplierResult.errors[0].error, /多条/);
      assert.equal(await db.product.count({ where: { customsName: '不可创建商品' } }), 0);
      await db.product.createMany({ data: [{ customsName: '合成重名商品' }, { customsName: '合成重名商品' }] });
      const productResult = await run([',,,合成重名商品,件,,1,1,']);
      assert.equal(productResult.successRows, 0);
      assert.equal(productResult.failedRows, 1);
      assert.match(productResult.errors[0].error, /多条/);
    });
    await t.test('旧CSV不能向已发运合同追加货物而绕过出库一致性约束', async () => {
      const before = await db.packingItem.count();
      const result = await run(['合成供应商,合成门店,合成港,合成商品,件,EXP-TEST-1,99,9,2026-01-01']);
      assert.equal(result.successRows, 0);
      assert.equal(result.failedRows, 1);
      assert.match(result.errors[0].error, /已发运|出库/);
      assert.equal(await db.packingItem.count(), before);
    });
    await t.test('后续写入失败回滚本行，新行不复用已回滚实体缓存', async () => {
      const result = await run([
        '合成回滚供应商,合成回滚门店,合成港,合成回滚商品,件,EXP-ROLLBACK-BAD,10,1,invalid-date',
        '合成回滚供应商,合成回滚门店,合成港,合成回滚商品,件,EXP-ROLLBACK-OK,10,1,2026-01-01',
      ]);
      assert.equal(result.successRows, 1);
      assert.equal(result.failedRows, 1);
      assert.equal(await db.salesContract.count({ where: { contractNo: 'EXP-ROLLBACK-BAD' } }), 0);
      const good = await db.salesContract.findUnique({ where: { contractNo: 'EXP-ROLLBACK-OK' }, include: { packingItems: true } });
      assert.equal(good.packingItems.length, 1);
      assert.equal(await db.supplier.count({ where: { name: '合成回滚供应商' } }), 1);
      assert.equal(await db.product.count({ where: { customsName: '合成回滚商品' } }), 1);
      const record = await db.importRecord.findFirst({ orderBy: { importedAt: 'desc' } });
      assert.equal(record.status, 'FAILED');
      assert.equal(record.failedRows, 1);
    });
  } finally {
    if (db) await db.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
