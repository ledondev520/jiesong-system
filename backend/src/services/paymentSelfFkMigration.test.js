/**
 * Input: 20261107010000_ensure_payment_self_fk_target/migration.sql、内存 SQLite（python3 sqlite3，与 sqlite-wal-concurrency 测试同法）
 * Output: 回归：旧库 payments 自引用外键指向 payments_fixed 时，前向迁移修复且保留数据；已正确的库迁移幂等
 * Pos: 迁移行为测试（B66/P0-10）；不触碰任何真实数据库
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MIGRATION = fs.readFileSync(path.resolve(__dirname, '../../prisma/migrations/20261107010000_ensure_payment_self_fk_target/migration.sql'), 'utf8');
const paymentsTable = (target) => `
CREATE TABLE "purchase_contracts" ("id" TEXT NOT NULL PRIMARY KEY);
CREATE TABLE "sales_contracts" ("id" TEXT NOT NULL PRIMARY KEY);
CREATE TABLE "payments" (
  "id" TEXT NOT NULL PRIMARY KEY, "idempotencyKey" TEXT, "type" TEXT NOT NULL, "purchaseContractId" TEXT,
  "salesContractId" TEXT, "sourcePaymentId" TEXT, "customerName" TEXT, "amount" REAL NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY', "paymentMethod" TEXT, "paymentDate" DATETIME NOT NULL, "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("sourcePaymentId") REFERENCES "${target}" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);`;

// 在内存库建旧形态 payments，应用迁移 SQL，输出结果 JSON。
const PY = `
import sqlite3, sys, json
ddl, migration = sys.argv[1], sys.argv[2]
db = sqlite3.connect(':memory:', isolation_level=None)
db.executescript(ddl)
db.executescript("INSERT INTO payments(id,type,amount,paymentDate,updatedAt) VALUES('p1','RECEIVABLE_RECEIPT',100,'2026-01-01','2026-01-01'); INSERT INTO payments(id,type,amount,paymentDate,updatedAt,sourcePaymentId) VALUES('p2','RECEIVABLE_COLLECTION',40,'2026-01-01','2026-01-01','p1');")
db.executescript(migration)
sql = db.execute("SELECT sql FROM sqlite_master WHERE name='payments'").fetchone()[0]
rows = db.execute('SELECT id, sourcePaymentId FROM payments ORDER BY id').fetchall()
db.execute('PRAGMA foreign_keys=ON')
db.execute("DELETE FROM payments WHERE id='p1'")  # pre-migration legacy DBs fail here: no such table main.payments_fixed
child = db.execute("SELECT sourcePaymentId FROM payments WHERE id='p2'").fetchone()[0]
indexes = db.execute("SELECT count(*) FROM sqlite_master WHERE type='index' AND tbl_name='payments' AND sql IS NOT NULL").fetchone()[0]
print(json.dumps({'sql': sql, 'rows': rows, 'child': child, 'indexes': indexes}))
`;

for (const [name, target] of [['旧库（自引用指向 payments_fixed）', 'payments_fixed'], ['已正确的库', 'payments']]) {
  test(`P0-10 迁移：${name}`, () => {
    const run = spawnSync('python3', ['-I', '-c', PY, paymentsTable(target), MIGRATION], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.match(out.sql, /REFERENCES "payments" \("id"\)/);
    assert.doesNotMatch(out.sql, /payments_fixed|new_payments/);
    assert.deepEqual(out.rows, [['p1', null], ['p2', 'p1']]);
    assert.equal(out.child, null, '删除父收款后子分配的 sourcePaymentId 置空');
    assert.equal(out.indexes, 7);
  });
}
