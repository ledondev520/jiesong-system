/** Real HTTP/SQLite GET /reports/business-overview: each unavailable shipment states its specific missing input, with counts by reason; synthetic fixtures only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { copyTemplate } = require("../testHelpers/sqlite-template");

test("HTTP/SQLite: business overview names the missing input per shipment and counts by reason", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jiesong-overview-reasons-"));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, "synthetic.db");
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, "uploads");
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-only-overview-reasons-never-for-production";
  let db, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  copyTemplate("schema", database);
  fs.chmodSync(database, 0o600);
  db = require("../utils/prisma");
  const jwt = require("jsonwebtoken");
  const config = require("../config");
  const user = await db.user.create({ data: { username: "synthetic-overview-finance", password: "test-only-unused-hash", name: "Synthetic", role: "ADMIN" } });
  const token = jwt.sign({ userId: user.id }, config.jwt.secret);
  const app = require("../app");
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  const supplier = await db.supplier.create({ data: { name: "Synthetic supplier" } });
  const product = await db.product.create({ data: { customsName: "Synthetic product" } });
  await db.purchaseContract.create({ data: { contractNo: "SYN-P-1", supplierId: supplier.id, status: "SIGNED", totalAmount: 1000, paidAmount: 0 } });
  const shippedAt = new Date("2026-09-15T00:00:00.000Z");
  const sale = (contractNo, extra = {}) => db.salesContract.create({ data: { contractNo, status: "SHIPPED", exchangeRate: 7, totalAmount: 100, shippedAt, ...extra } });
  const line = (salesContractId, extra = {}) => db.packingItem.create({
    data: { salesContractId, productId: product.id, quantity: 1, totalPrice: 100, isOwnedByJiesong: true, purchaseContractNo: "SYN-P-1", purchaseCost: 70, ...extra },
  });
  const ready = await sale("SYN-S-READY"); await line(ready.id);
  const noRate = await sale("SYN-S-NORATE", { exchangeRate: 0 }); await line(noRate.id);
  const noCost = await sale("SYN-S-NOCOST"); await line(noCost.id, { purchaseCost: null });
  const both = await sale("SYN-S-BOTH", { exchangeRate: 0 }); await line(both.id, { purchaseCost: null, purchaseContractNo: null });
  const thirdParty = await sale("SYN-S-THIRD"); await line(thirdParty.id, { isOwnedByJiesong: false, purchaseCost: 0, purchaseContractNo: null });
  await sale("SYN-S-NOLINES");
  await sale("SYN-S-NODATE", { shippedAt: null });

  const response = await fetch(`${base}/reports/business-overview`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const { overview } = (await response.json()).data;

  assert.equal(overview.contractCount, 6, "未设发运日期的那笔不在期间内");
  assert.equal(overview.marginReady, false);
  assert.equal(overview.grossProfit, null, "整体口径仍须全部核实");
  assert.equal(overview.shippedWithoutDate, 1);

  const byNo = Object.fromEntries(overview.unavailableContracts.map((row) => [row.contractNo, row.reasonCodes.sort()]));
  assert.deepEqual(byNo, {
    "SYN-S-NORATE": ["MISSING_EXCHANGE_RATE"],
    "SYN-S-NOCOST": ["MISSING_PURCHASE_COST"],
    "SYN-S-BOTH": ["MISSING_EXCHANGE_RATE", "MISSING_PURCHASE_COST"],
    "SYN-S-NOLINES": ["MISSING_PACKING_ITEMS"],
  });
  assert.ok(!("SYN-S-THIRD" in byNo), "全是第三方拼柜 = 无自有货物，不算缺数据");
  assert.match(overview.unavailableContracts.find((row) => row.contractNo === "SYN-S-NOCOST").reasons[0], /缺已售成本（1\/1 条自有明细未填成本；1 条已关联采购合同，0 条未关联）/);

  assert.deepEqual(overview.marginReasonSummary.map(({ code, count }) => [code, count]), [
    ["MISSING_EXCHANGE_RATE", 2], ["MISSING_PURCHASE_COST", 2], ["MISSING_PACKING_ITEMS", 1],
  ]);
  // 净现金不可用的合同集合 = 毛利不可用合同 + 资金侧缺口；本夹具无额外资金侧缺口
  assert.deepEqual(overview.cashReasonSummary, overview.marginReasonSummary.concat().sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)));
  assert.equal(overview.cashReady, false);

  assert.equal(overview.verified.contractCount, 2, "READY 与全第三方拼柜两笔可核实");
  assert.equal(overview.verified.grossProfit, 7 * 100 - 70, "只有 READY 有自有货物：630");
  assert.equal(overview.verified.totalPurchases, 70);
});
