/** Real HTTP/SQLite archive/restore of suppliers and the archive-test-data selection rules; synthetic fixtures only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("HTTP/SQLite: archived suppliers leave default lists, stay readable, and only ADMIN restores", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jiesong-archive-"));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, "synthetic.db");
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-only-archive-never-for-production";
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
        assert.ok(Date.now() < deadline, "archive fixture audit writes did not settle");
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
  for (const role of ["ADMIN", "PURCHASE"]) {
    const user = await db.user.create({
      data: { username: `synthetic-archive-${role}`, password: "test-only-unused-hash", name: `Synthetic ${role}`, role },
    });
    tokens[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  const app = require("../app");
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = "PURCHASE", expected = 200) => {
    const requestId = `synthetic-archive-${++requestNumber}`;
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
  const ids = async (query) => (await call("GET", `/suppliers?${query}`)).map((row) => row.id).sort();

  const keep = await db.supplier.create({ data: { name: "Synthetic keep supplier" } });
  const doubtful = await db.supplier.create({ data: { name: "Synthetic doubtful supplier (存疑)" } });
  const damaged = await db.supplier.create({ data: { name: "Synthetic damaged supplier (文件损坏)" } });
  const qa = await db.supplier.create({ data: { name: "QA-Synthetic supplier" } });
  const port = await db.port.create({ data: { name: "Synthetic port", code: "SYN-P" } });
  const qaStore = await db.store.create({ data: { name: "QA-Synthetic store", portId: port.id } });
  const realStore = await db.store.create({ data: { name: "Synthetic real store", portId: port.id } });
  const qaProduct = await db.product.create({ data: { customsName: "QA-Synthetic product" } });
  const realProduct = await db.product.create({ data: { customsName: "Synthetic real product" } });
  // Case-sensitive: lowercase "qa-" is a real name, not test data.
  const lowerQa = await db.supplier.create({ data: { name: "qa-synthetic lowercase supplier" } });

  const archive = require("../../scripts/archive-test-data");

  // Dry-run selection: exact rules, no writes, damaged only on request.
  let plan = await archive.selectTargets(db, {});
  assert.deepEqual(plan.suppliers.map((r) => r.id).sort(), [doubtful.id, qa.id].sort());
  assert.deepEqual(plan.stores.map((r) => r.id), [qaStore.id]);
  assert.deepEqual(plan.products.map((r) => r.id), [qaProduct.id]);
  assert.equal(plan.suppliers.find((r) => r.id === doubtful.id).reason, "doubtful");
  const withDamaged = await archive.selectTargets(db, { includeDamaged: true });
  assert.deepEqual(withDamaged.suppliers.map((r) => r.id).sort(), [damaged.id, doubtful.id, qa.id].sort());
  assert.equal(await db.supplier.count({ where: { isActive: false } }), 0, "selection must not write");

  // Dry-run main() writes nothing and needs no backup.
  const dry = await archive.main([], db);
  assert.equal(dry.applied, false);
  assert.equal(await db.supplier.count({ where: { isActive: false } }), 0);
  await assert.rejects(archive.main(["--confirm"], db), /--backup-dir/);
  assert.equal(await db.supplier.count({ where: { isActive: false } }), 0, "confirm without a backup dir changes nothing");

  // Apply (backup step is covered by sqlite_snapshot tests; here we exercise the transactional flip).
  assert.deepEqual(await archive.applyPlan(db, plan, false), { suppliers: 2, stores: 1, products: 1 });
  assert.deepEqual(await archive.applyPlan(db, plan, false), { suppliers: 0, stores: 0, products: 0 }, "re-run is idempotent");
  assert.equal(await db.supplier.count(), 5, "archiving never hard-deletes");

  // Default list and lite picker hide archived suppliers; 已归档 filter shows them.
  assert.deepEqual(await ids("pageSize=100"), [damaged.id, keep.id, lowerQa.id].sort());
  assert.deepEqual(await ids("pageSize=100&lite=true"), [damaged.id, keep.id, lowerQa.id].sort());
  assert.deepEqual(await ids("pageSize=100&status=archived"), [doubtful.id, qa.id].sort());
  assert.equal((await ids("pageSize=100&status=all")).length, 5);
  assert.equal((await call("GET", `/suppliers/${doubtful.id}`)).isActive, false, "history can still read an archived supplier");

  // Restore through the editor endpoint is ADMIN only.
  await call("PUT", `/suppliers/${doubtful.id}`, { isActive: true }, "PURCHASE", 403);
  assert.equal((await db.supplier.findUnique({ where: { id: doubtful.id } })).isActive, false);
  await call("PUT", `/suppliers/${doubtful.id}`, { isActive: true }, "ADMIN");
  assert.equal((await db.supplier.findUnique({ where: { id: doubtful.id } })).isActive, true);
  // A normal edit by a non-admin does not restore.
  await call("PUT", `/suppliers/${qa.id}`, { contactName: "Synthetic edit" }, "PURCHASE");
  assert.equal((await db.supplier.findUnique({ where: { id: qa.id } })).isActive, false);

  // Archive via the existing DELETE route is a soft archive.
  await call("DELETE", `/suppliers/${doubtful.id}`, undefined, "PURCHASE");
  assert.equal(await db.supplier.count({ where: { id: doubtful.id } }), 1);
  assert.equal((await db.supplier.findUnique({ where: { id: doubtful.id } })).isActive, false);

  // Script-level restore from the plan returns stores/products too.
  assert.deepEqual(await archive.applyPlan(db, plan, true), { suppliers: 2, stores: 1, products: 1 });
  assert.equal((await db.store.findUnique({ where: { id: qaStore.id } })).isActive, true);
  assert.equal((await db.store.findUnique({ where: { id: realStore.id } })).isActive, true);
  assert.equal((await db.product.findUnique({ where: { id: realProduct.id } })).isActive, true);
});
