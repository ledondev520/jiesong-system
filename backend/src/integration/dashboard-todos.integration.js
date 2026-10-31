/** Real HTTP/SQLite GET /dashboard/todos per role: visible lists, payables basis, BOSS read-only access; synthetic fixtures only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("HTTP/SQLite: dashboard todos are role-scoped, read-only and use the single payables basis", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jiesong-todos-"));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, "synthetic.db");
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-only-todos-never-for-production";
  let db, server;
  let requestNumber = 0;
  const expectedAuditRequests = new Set();
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    // Async response-finish audit writes must settle before SQLite is removed.
    if (db && expectedAuditRequests.size) {
      const deadline = Date.now() + 5000;
      while (true) {
        const saved = await db.operationLog.findMany({
          where: { requestId: { in: [...expectedAuditRequests] } },
          select: { requestId: true },
        });
        const persisted = new Set(saved.map((row) => row.requestId));
        if ([...expectedAuditRequests].every((id) => persisted.has(id))) break;
        assert.ok(Date.now() < deadline, "todos fixture audit writes did not settle");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ddl = execFileSync(
    process.execPath,
    [
      require.resolve("prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      path.resolve(__dirname, "../../prisma/schema.prisma"),
      "--script",
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  execFileSync(
    "python3",
    ["-c", "import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()", database],
    { input: ddl },
  );
  fs.chmodSync(database, 0o600);
  db = require("../utils/prisma");
  const jwt = require("jsonwebtoken");
  const config = require("../config");
  const tokens = {};
  for (const role of ["ADMIN", "BOSS", "PURCHASE", "SALES", "FINANCE", "WAREHOUSE"]) {
    const user = await db.user.create({
      data: { username: `synthetic-todos-${role}`, password: "test-only-unused-hash", name: `Synthetic ${role}`, role },
    });
    tokens[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  const app = require("../app");
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = "PURCHASE", expected = 200) => {
    const requestId = `synthetic-todos-${++requestNumber}`;
    const response = await fetch(base + url, {
      method,
      headers: {
        authorization: `Bearer ${tokens[role]}`,
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (["POST", "PUT", "DELETE"].includes(method) && response.status >= 200 && response.status < 300) {
      expectedAuditRequests.add(requestId);
    }
    assert.equal(response.status, expected, `${role} ${method} ${url}: ${result.message || ""}`);
    return result.data;
  };
  const supplier = await db.supplier.create({ data: { name: "Synthetic todo supplier" } });
  const port = await db.port.create({ data: { name: "Synthetic port", code: "SYN-P" } });
  const store = await db.store.create({ data: { name: "Synthetic store", portId: port.id } });
  const product = await db.product.create({ data: { customsName: "Synthetic product" } });
  const purchase = (contractNo, status, totalAmount, paidAmount) =>
    db.purchaseContract.create({ data: { contractNo, supplierId: supplier.id, status, totalAmount, paidAmount } });
  await purchase("SYN-P-DRAFT", "DRAFT", 1000, 0);
  const signed = await purchase("SYN-P-SIGNED", "SIGNED", 1000, 400);
  await purchase("SYN-P-SHIPPED", "SHIPPED", 500, 500);
  const sale = (contractNo, status, extra = {}) =>
    db.salesContract.create({ data: { contractNo, status, exchangeRate: 7, totalAmount: 1000, ...extra } });
  const line = (salesContractId) =>
    db.salesItem.create({ data: { salesContractId, productId: product.id, storeId: store.id, quantity: 1, costPrice: 1, sellingPrice: 2 } });
  const open = await sale("SYN-S-OPEN", "CONFIRMED");
  await line(open.id);
  const allocated = await sale("SYN-S-ALLOCATED", "CONFIRMED");
  const allocatedItem = await line(allocated.id);
  await db.inventory.create({ data: { productId: product.id, quantity: 1, salesItemId: allocatedItem.id } });
  await sale("SYN-S-PACKING", "PACKING");
  const overdue = await sale("SYN-S-OVERDUE", "SHIPPED", { shippedAt: new Date(Date.now() - 60 * 86400000) });
  const declaration = await db.customsDeclaration.create({ data: { declarationNo: "SYN-D-1", salesContractId: overdue.id } });
  await db.taxRefund.create({ data: { refundNo: "SYN-R-1", salesContractId: overdue.id, customsDeclarationId: declaration.id, match_status: "passed", refundableAmount: 130 } });
  await db.taxRefund.create({ data: { refundNo: "SYN-R-2", salesContractId: overdue.id, customsDeclarationId: declaration.id, match_status: "blocked" } });

  const todos = (role, expected = 200) => call("GET", "/dashboard/todos", undefined, role, expected);
  const keys = (data) => Object.keys(data.lists).sort();

  await call("GET", "/dashboard/todos", undefined, "ANONYMOUS", 401);

  const admin = await todos("ADMIN");
  assert.deepEqual(keys(admin), ["missingInvoice", "ordersToPurchase", "overdueReceivables", "paymentsDue", "receiptsToInspect", "refundable", "toLoad", "toShip"]);
  assert.equal(admin.figures, undefined);
  assert.equal(admin.lists.ordersToPurchase.count, 1);
  assert.equal(admin.lists.ordersToPurchase.items[0].contractNo, "SYN-S-OPEN");
  // Payables: draft excluded, SIGNED outstanding 600, fully paid SHIPPED excluded.
  assert.equal(admin.lists.paymentsDue.count, 1);
  assert.equal(admin.lists.paymentsDue.items[0].contractNo, "SYN-P-SIGNED");
  assert.equal(admin.lists.paymentsDue.items[0].amount, 600);
  assert.equal(admin.lists.receiptsToInspect.count, 1);
  assert.equal(admin.lists.toLoad.count, 2);
  assert.equal(admin.lists.toShip.count, 1);
  assert.equal(admin.lists.missingInvoice.count, 1);
  assert.equal(admin.lists.missingInvoice.items[0].contractNo, "SYN-P-SHIPPED");
  assert.equal(admin.lists.overdueReceivables.count, 1);
  assert.equal(admin.lists.overdueReceivables.items[0].amount, 1000);
  assert.equal(admin.lists.refundable.count, 1);
  assert.equal(admin.lists.refundable.items[0].contractNo, "SYN-R-1");

  assert.deepEqual(keys(await todos("PURCHASE")), ["ordersToPurchase", "paymentsDue", "receiptsToInspect"]);
  assert.deepEqual(keys(await todos("SALES")), ["overdueReceivables", "toLoad", "toShip"]);
  assert.deepEqual(keys(await todos("WAREHOUSE")), ["receiptsToInspect", "toLoad", "toShip"]);
  assert.deepEqual(keys(await todos("FINANCE")), ["missingInvoice", "overdueReceivables", "paymentsDue", "refundable"]);

  const boss = await todos("BOSS");
  assert.deepEqual(keys(boss), ["overdueReceivables"]);
  assert.equal(boss.figures.payable, 600, "BOSS payable uses the shared in-effect basis");
  assert.equal(typeof boss.figures.receivable, "number");
  assert.ok("monthGrossProfit" in boss.figures);
  assert.ok(boss.figures.definitions.payable);

  // Read-only: the reads above changed no business rows.
  assert.equal(await db.purchaseContract.count(), 3);
  assert.equal((await db.purchaseContract.findUnique({ where: { id: signed.id } })).paidAmount, 400);
});
