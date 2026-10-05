/** Real HTTP/SQLite supplier editor persistence and unchanged role boundaries; synthetic fixtures only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("HTTP/SQLite: supplier editor preserves aliases, quality state and optional fields", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "jiesong-supplier-editor-"),
  );
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, "synthetic.db");
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-only-supplier-editor-never-for-production";
  let db, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
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
    [
      "-c",
      "import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()",
      database,
    ],
    { input: ddl },
  );
  fs.chmodSync(database, 0o600);
  db = require("../utils/prisma");
  const jwt = require("jsonwebtoken");
  const config = require("../config");
  const tokens = {};
  for (const role of [
    "ADMIN",
    "PURCHASE",
    "SALES",
    "FINANCE",
    "WAREHOUSE",
    "BOSS",
  ]) {
    const user = await db.user.create({
      data: {
        username: `synthetic-editor-${role}`,
        password: "test-only-unused-hash",
        name: `Synthetic ${role}`,
        role,
      },
    });
    tokens[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  const app = require("../app");
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = "PURCHASE", expected = 200) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(
      response.status,
      expected,
      `${role} ${method} ${url}: ${result.message || ""}`,
    );
    return result.data;
  };
  await call("POST", "/suppliers", { name: "   " }, "PURCHASE", 400);
  await call(
    "POST",
    "/suppliers",
    { name: "Synthetic forbidden" },
    "BOSS",
    403,
  );
  await call(
    "POST",
    "/suppliers",
    { name: "Synthetic anonymous" },
    "ANONYMOUS",
    401,
  );
  assert.equal(await db.supplier.count(), 0);
  const input = {
    name: "Synthetic quality supplier",
    shortName: "Synthetic short name",
    contactName: "Synthetic contact",
    contactPhone: "synthetic-phone",
    contactEmail: "supplier@example.invalid",
    address: "Synthetic address",
    phone: "",
    taxId: "",
    bankAccountName: "",
    bankName: "",
    bankBranch: "",
    bankCode: "",
    bankAccount: "",
    hasQualityIssue: true,
    qualityNote: "Synthetic quality note",
    aliases: [
      { alias: "Synthetic alias one" },
      { alias: "Synthetic alias two" },
    ],
  };
  const created = await call("POST", "/suppliers", input, "PURCHASE", 201);
  let saved = await call("GET", `/suppliers/${created.id}`);
  assert.equal(
    saved.hasQualityIssue,
    true,
    "the visible quality flag must persist on creation",
  );
  assert.equal(saved.qualityNote, input.qualityNote);
  assert.deepEqual(
    saved.aliases.map((entry) => entry.alias).sort(),
    input.aliases.map((entry) => entry.alias).sort(),
  );
  assert.equal(saved.contactEmail, input.contactEmail);
  assert.equal(await db.supplier.count(), 1);
  const changed = {
    hasQualityIssue: false,
    qualityNote: "",
    aliases: [{ alias: "Synthetic replacement alias" }],
  };
  await call("PUT", `/suppliers/${created.id}`, changed);
  saved = await call("GET", `/suppliers/${created.id}`);
  assert.equal(saved.hasQualityIssue, false);
  assert.equal(saved.qualityNote || "", "");
  assert.deepEqual(
    saved.aliases.map((entry) => entry.alias),
    ["Synthetic replacement alias"],
  );
  assert.equal(
    saved.contactEmail,
    input.contactEmail,
    "omitted optional fields retain their saved value",
  );
  await call("PUT", `/suppliers/${created.id}`, {
    contactName: "Synthetic revised contact",
  });
  saved = await call("GET", `/suppliers/${created.id}`);
  assert.deepEqual(
    saved.aliases.map((entry) => entry.alias),
    ["Synthetic replacement alias"],
    "omitted aliases do not clear them",
  );
  await call("PUT", `/suppliers/${created.id}`, { aliases: [] });
  saved = await call("GET", `/suppliers/${created.id}`);
  assert.deepEqual(saved.aliases, [], "an explicit empty list clears aliases");
  await call("PUT", `/suppliers/${created.id}`, {
    aliases: [{ alias: "Synthetic retained alias" }],
  });
  const occupied = await db.supplier.create({
    data: {
      name: "Synthetic alias owner",
      aliases: { create: [{ alias: "Synthetic occupied alias" }] },
    },
  });
  const atomicBefore = await db.supplier.findUnique({
    where: { id: created.id },
    include: { aliases: true },
  });
  await call(
    "PUT",
    `/suppliers/${created.id}`,
    {
      contactName: "Synthetic rejected change",
      hasQualityIssue: true,
      aliases: [{ alias: "Synthetic occupied alias" }],
    },
    "PURCHASE",
    409,
  );
  assert.deepEqual(
    await db.supplier.findUnique({
      where: { id: created.id },
      include: { aliases: true },
    }),
    atomicBefore,
    "a conflicting alias rolls back the entire editor update",
  );
  await call(
    "PUT",
    `/suppliers/${created.id}`,
    { aliases: [{ alias: "   " }] },
    "PURCHASE",
    400,
  );
  assert.deepEqual(
    await db.supplier.findUnique({
      where: { id: created.id },
      include: { aliases: true },
    }),
    atomicBefore,
  );
  const countBeforeConflict = await db.supplier.count();
  await call(
    "POST",
    "/suppliers",
    {
      name: "Synthetic rejected new supplier",
      aliases: [{ alias: "Synthetic occupied alias" }],
    },
    "PURCHASE",
    409,
  );
  assert.equal(
    await db.supplier.count(),
    countBeforeConflict,
    "a conflicting alias cannot leave a partial supplier",
  );
  await db.supplierAlias.deleteMany({ where: { supplierId: occupied.id } });
  await db.supplier.delete({ where: { id: occupied.id } });
  const before = await db.supplier.findUnique({
    where: { id: created.id },
    include: { aliases: true },
  });
  await call(
    "PUT",
    `/suppliers/${created.id}`,
    { contactName: "Synthetic denied mutation" },
    "BOSS",
    403,
  );
  assert.deepEqual(
    await db.supplier.findUnique({
      where: { id: created.id },
      include: { aliases: true },
    }),
    before,
  );
  for (const role of ["ADMIN", "SALES", "FINANCE", "WAREHOUSE"]) {
    const supplier = await call(
      "POST",
      "/suppliers",
      { name: `Synthetic ${role} supplier` },
      role,
      201,
    );
    await call(
      "PUT",
      `/suppliers/${supplier.id}`,
      { shortName: `Synthetic ${role} revision` },
      role,
    );
  }
  assert.equal(
    await db.supplier.count(),
    5,
    "the existing five business write roles remain allowed",
  );
});
