/** Real HTTP/SQLite: order-level customer rules (DATA-MODEL §2.4) and store archive/restore; synthetic fixtures only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("HTTP/SQLite: orders take the single active customer and its terms, customer changes are DRAFT-only, stores archive like suppliers", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jiesong-order-customer-"));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, "synthetic.db");
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-only-order-customer-never-for-production";
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
        assert.ok(Date.now() < deadline, "order-customer fixture audit writes did not settle");
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
  for (const role of ["ADMIN", "SALES", "PURCHASE"]) {
    const user = await db.user.create({
      data: { username: `synthetic-order-customer-${role}`, password: "test-only-unused-hash", name: `Synthetic ${role}`, role },
    });
    tokens[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  const app = require("../app");
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = "PURCHASE", expected = 200) => {
    const requestId = `synthetic-order-customer-${++requestNumber}`;
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
  const call2 = (method, url, body, role = "SALES") => call(method, url, body, role, 200);
  const sale = (body, expected = 201, role = "SALES") => call("POST", "/sales", body, role, expected);

  const port = await db.port.create({ data: { name: "Synthetic port", code: "SYN-P" } });
  const store = await db.store.create({ data: { name: "Synthetic store", portId: port.id } });
  const product = await db.product.create({ data: { customsName: "Synthetic product" } });
  const lines = [{ productId: product.id, storeId: store.id, quantity: 1, costPrice: 10 }];

  // 0 active customers => 400 on both creation paths, nothing created.
  await sale({ exchangeRate: 7 }, 400);
  await sale({ exchangeRate: 7, items: lines }, 400);
  assert.equal(await db.salesContract.count(), 0);

  // exactly one active customer (an archived one does not count) => linked, terms copied.
  const seapot = await db.customer.create({
    data: { name: "Synthetic Seapot", defaultIncoterm: "FOB", defaultPaymentTerms: "T/T 30% deposit", defaultPortOfLoading: "Shanghai" },
  });
  await db.customer.create({ data: { name: "Synthetic archived customer", isActive: false } });
  for (const body of [{ exchangeRate: 7 }, { exchangeRate: 7, items: lines }]) {
    const created = await sale(body);
    const row = await db.salesContract.findUnique({ where: { id: created.id } });
    assert.equal(row.customerId, seapot.id);
    assert.deepEqual(
      { currency: row.currency, incoterm: row.incoterm, paymentTerms: row.paymentTerms, portOfLoading: row.portOfLoading },
      { currency: "USD", incoterm: "FOB", paymentTerms: "T/T 30% deposit", portOfLoading: "Shanghai" },
    );
  }
  // Request values win over the customer defaults; incoterm is normalised.
  const custom = await sale({ exchangeRate: 7, incoterm: "cif", paymentTerms: "L/C at sight", portOfLoading: "Ningbo" });
  const customRow = await db.salesContract.findUnique({ where: { id: custom.id } });
  assert.deepEqual({ i: customRow.incoterm, p: customRow.paymentTerms, l: customRow.portOfLoading }, { i: "CIF", p: "L/C at sight", l: "Ningbo" });
  await sale({ exchangeRate: 7, incoterm: "XYZ" }, 400);
  await sale({ exchangeRate: 7, currency: "EUR" }, 400);
  // Malformed (non-string) term fields are rejected on BOTH creation paths, never defaulted to the customer's terms (R2-2).
  const before = await db.salesContract.count();
  for (const field of ["incoterm", "paymentTerms", "portOfLoading", "currency", "customerId"]) {
    for (const value of [42, true, {}, ["FOB"]]) {
      await sale({ exchangeRate: 7, [field]: value }, 400);
      await sale({ exchangeRate: 7, items: lines, [field]: value }, 400);
    }
  }
  await sale({ exchangeRate: 7, paymentTerms: "x".repeat(501) }, 400);
  await sale({ exchangeRate: 7, items: lines, portOfLoading: "x".repeat(201) }, 400);
  assert.equal(await db.salesContract.count(), before, "no order was created by malformed terms");
  // null / empty string mean "not supplied" and fall back to the customer defaults.
  const blank = await sale({ exchangeRate: 7, incoterm: null, paymentTerms: "", portOfLoading: null });
  assert.equal((await db.salesContract.findUnique({ where: { id: blank.id } })).incoterm, "FOB");
  await sale({ exchangeRate: 7, customerId: "no-such-customer" }, 400);
  await sale({ exchangeRate: 7, customerId: (await db.customer.findFirst({ where: { isActive: false } })).id }, 400);

  // two active customers => 400 unless the request names one.
  const second = await db.customer.create({ data: { name: "Synthetic second customer" } });
  await sale({ exchangeRate: 7 }, 400);
  await sale({ exchangeRate: 7, items: lines }, 400);
  const explicit = await sale({ exchangeRate: 7, customerId: second.id });
  assert.equal((await db.salesContract.findUnique({ where: { id: explicit.id } })).customerId, second.id);

  // customerId may change only while the order is DRAFT.
  const draft = await sale({ exchangeRate: 7, customerId: seapot.id });
  await call("PUT", `/sales/${draft.id}`, { customerId: second.id }, "SALES", 200);
  assert.equal((await db.salesContract.findUnique({ where: { id: draft.id } })).customerId, second.id);
  await call("PUT", `/sales/${draft.id}`, { customerId: null }, "SALES", 400);
  await call("PUT", `/sales/${draft.id}`, { customerId: "no-such-customer" }, "SALES", 400);
  await db.salesContract.update({ where: { id: draft.id }, data: { status: "CONFIRMED" } });
  await call("PUT", `/sales/${draft.id}`, { customerId: seapot.id }, "SALES", 400);
  await call("PUT", `/sales/${draft.id}`, { customerId: second.id, note: "same customer is a no-op" }, "SALES", 200);
  assert.equal((await db.salesContract.findUnique({ where: { id: draft.id } })).customerId, second.id);

  // Stores: archive like suppliers. Default list and lite picker hide archived stores; GET /:id still resolves them.
  const qa = await db.store.create({ data: { name: "QA-Synthetic store", portId: port.id } });
  const ids = async (query) => (await call2("GET", `/stores?${query}`)).items.map((row) => row.id).sort();
  assert.deepEqual(await ids("pageSize=100"), [store.id, qa.id].sort());
  await call("PUT", `/stores/${qa.id}`, { isActive: false }, "SALES", 200);   // archiving stays open to the store write roles
  assert.deepEqual(await ids("pageSize=100"), [store.id]);
  assert.deepEqual(await ids("pageSize=100&lite=true"), [store.id]);
  assert.deepEqual(await ids("pageSize=100&status=archived"), [qa.id]);
  assert.deepEqual(await ids("pageSize=100&status=all"), [store.id, qa.id].sort());
  assert.equal((await call2("GET", `/stores/${qa.id}`)).isActive, false);
  // Restore is ADMIN only.
  await call("PUT", `/stores/${qa.id}`, { isActive: true }, "SALES", 403);
  await call("PUT", `/stores/${qa.id}`, { isActive: true }, "PURCHASE", 403);
  assert.equal((await db.store.findUnique({ where: { id: qa.id } })).isActive, false);
  await call("PUT", `/stores/${qa.id}`, { isActive: true }, "ADMIN", 200);
  assert.equal((await db.store.findUnique({ where: { id: qa.id } })).isActive, true);
  // A normal edit by a non-admin does not restore.
  await call("PUT", `/stores/${qa.id}`, { isActive: false }, "SALES", 200);
  await call("PUT", `/stores/${qa.id}`, { contactName: "Synthetic edit" }, "SALES", 200);
  assert.equal((await db.store.findUnique({ where: { id: qa.id } })).isActive, false);
});
