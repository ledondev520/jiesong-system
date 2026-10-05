/** Real role UI + Express/SQLite acceptance. Hosted Playwright is the browser gate. */
import { test, expect, type Page } from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  readDomain,
  readPurchaseNotifications,
  testPassword,
  type RoleFixture,
} from "./real-role-fixture";

const productName = "合成角色验收商品";
const mutation = (page: Page, pathname: string, method = "POST") =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1${pathname}` &&
      response.request().method() === method,
  );
const inbound = (fixture: RoleFixture) =>
  readDomain(fixture)
    .inventory.filter((row) => row.status === "INBOUND")
    .reduce((sum, row) => sum + row.quantity, 0);

// Each case/retry owns a fresh DB and rate limiter; no ordering or shared-role state.
test.setTimeout(90000);
test.use({ viewport: { width: 1440, height: 900 } });
let fixture: RoleFixture;
let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(async () => {
  if (fixture) await stopRoleFixture(fixture);
  expect(pageErrors).toEqual([]);
});

test("PURCHASE repeated notification mark-one keeps the displayed count equal to real persisted unread count", async ({
  page,
  request,
}) => {
  fixture = await startRoleFixture("notification-state");
  await forwardRealApi(page, fixture);
  const token = await loginAs(page, fixture, "PURCHASE");
  const before = readPurchaseNotifications(fixture);
  expect(before).toHaveLength(4);
  expect(before.filter((row) => !row.isRead)).toHaveLength(3);
  const notification = before.find((row) => row.title === "合成通知 1")!;
  const trigger = page
    .locator('button[data-slot="dropdown-menu-trigger"]')
    .filter({ hasText: "通知" });
  await expect(trigger.locator('[data-slot="badge"]')).toHaveText("3");
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("3 条未读", { exact: true })).toBeVisible();

  const pathname = `/api/v1/notifications/${notification.id}/read`;
  let markRequests = 0;
  let firstFetched = false;
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const forwarded: Promise<void>[] = [];
  // Delay delivery only. Each intercepted request still reaches unchanged Express
  // auth/service/SQLite once, and its genuine response is fulfilled without edits.
  await page.route(`http://127.0.0.1:3004${pathname}`, (route) => {
    const work = (async () => {
      expect(route.request().method()).toBe("POST");
      const sequence = ++markRequests;
      const response = await route.fetch({
        url: `${fixture.baseURL}${pathname}`,
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
      if (sequence === 1) {
        firstFetched = true;
        await gate;
      }
      await route.fulfill({ response });
    })();
    forwarded.push(work);
    return work;
  });
  const completed = mutation(page, `/notifications/${notification.id}/read`);
  try {
    await menu.getByRole("button", { name: /合成通知 1/ }).dblclick();
    await expect.poll(() => firstFetched).toBe(true);
    expect(
      readPurchaseNotifications(fixture).filter((row) => !row.isRead),
    ).toHaveLength(2);
  } finally {
    releaseFirst();
  }
  expect((await completed).status()).toBe(200);
  await Promise.all(forwarded);
  await expect(menu.getByText("2 条未读", { exact: true })).toBeVisible();
  await expect(trigger.locator('[data-slot="badge"]')).toHaveText("2");
  expect(markRequests).toBe(1);
  const after = readPurchaseNotifications(fixture);
  expect(after).toEqual(
    before.map((row) =>
      row.id === notification.id ? { ...row, isRead: 1 } : row,
    ),
  );
  const unread = await request.get(
    `${fixture.baseURL}/api/v1/notifications/unread-count`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  expect(unread.status()).toBe(200);
  expect((await unread.json()).data.count).toBe(2);

  await page.reload();
  await expect(trigger.locator('[data-slot="badge"]')).toHaveText("2");
  await trigger.click();
  await expect(menu.getByText("2 条未读", { exact: true })).toBeVisible();
  await menu.getByRole("button", { name: /合成通知 1/ }).click();
  expect(markRequests).toBe(1);
  expect(readPurchaseNotifications(fixture)).toEqual(after);
});

test("PURCHASE arrival survives reload and stays pending until inspection", async ({
  page,
}) => {
  fixture = await startRoleFixture("purchase");
  await forwardRealApi(page, fixture);
  await loginAs(page, fixture, "PURCHASE");
  await page.goto(`/dashboard/purchase/${fixture.purchaseId}`);
  await expect(page.getByText("分批到货与验货", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "登记分批到货" }).click();
  const dialog = page.getByRole("dialog", { name: "登记本批到货" });
  await dialog.getByLabel(`${productName} 本批到货量`).fill("40");
  await dialog.getByLabel("到货备注").fill("合成到货草稿，取消不落库");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(readDomain(fixture).receipts).toHaveLength(0);
  await page.getByRole("button", { name: "登记分批到货" }).click();
  await expect(dialog.getByLabel("到货备注")).toHaveValue("");
  await dialog.getByLabel("到货日期").fill("2026-10-01");
  await dialog.getByLabel(`${productName} 本批到货量`).fill("40");
  await dialog.getByLabel("到货备注").fill("合成采购登记40件");
  const saved = mutation(page, `/purchases/${fixture.purchaseId}/receipts`);
  await dialog.getByRole("button", { name: "保存到货" }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("采购 100 · 已到 40 · 剩余 60")).toBeVisible();
  await expect(
    page.getByText("合格 0 · 待验 40 · 待复验 0", { exact: true }),
  ).toBeVisible();
  const domain = readDomain(fixture);
  expect(domain.receipts).toHaveLength(1);
  expect(domain.receipts[0]).toMatchObject({
    createdById: fixture.users.PURCHASE.id,
    note: "合成采购登记40件",
  });
  expect(domain.receiptItems[0]).toMatchObject({
    arrivedQuantity: 40,
    acceptedQuantity: 0,
    reinspectionQuantity: 0,
  });
  expect(domain.inspections).toHaveLength(0);
  expect(domain.inventory).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByText("本批到货 40 · 合格 0 · 待验 40 · 待复验 0"),
  ).toBeVisible();
  expect(readDomain(fixture).receipts).toHaveLength(1);
});

test("WAREHOUSE inspection persists its actor and only accepted stock reaches inventory", async ({
  page,
}) => {
  fixture = await startRoleFixture("warehouse");
  await forwardRealApi(page, fixture);
  await loginAs(page, fixture, "WAREHOUSE");
  await page.goto(`/dashboard/purchase/${fixture.purchaseId}`);
  await page.getByRole("button", { name: "登记验货", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "登记本批验货" });
  await dialog.getByLabel(`${productName} 累计合格量`).fill("30");
  await dialog.getByLabel(`${productName} 待复验量`).fill("10");
  await dialog.getByLabel("验货说明").fill("合成检验：30件合格，10件待复验");
  const saved = mutation(
    page,
    `/purchases/${fixture.purchaseId}/receipts/${fixture.receiptId}/inspection`,
  );
  await dialog.getByRole("button", { name: "保存验货" }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByText("本批到货 40 · 合格 30 · 待验 0 · 待复验 10"),
  ).toBeVisible();
  const domain = readDomain(fixture);
  expect(domain.inspections).toHaveLength(1);
  expect(domain.inspections[0]).toMatchObject({
    inspectedById: fixture.users.WAREHOUSE.id,
    receiptItemId: fixture.receiptItemId,
    acceptedQuantity: 30,
    acceptedIncrement: 30,
    pendingQuantity: 0,
    reinspectionQuantity: 10,
  });
  expect(domain.inventory).toHaveLength(1);
  expect(domain.inventory[0]).toMatchObject({
    quantity: 30,
    status: "INBOUND",
    purchaseItemId: fixture.purchaseItemId,
    receiptInspectionId: domain.inspections[0].id,
    salesContractId: null,
  });
  await page.getByRole("button", { name: "全部验货记录" }).click();
  const history = page.getByRole("dialog", { name: "本批全部验货记录" });
  await expect(
    history.getByText("合成WAREHOUSE", { exact: false }),
  ).toBeVisible();
  await expect(
    history.getByText("合成检验：30件合格，10件待复验"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/dashboard/inventory-status");
  const row = page.getByRole("row").filter({ hasText: productName });
  await expect(row).toContainText("CG-SYNTHETIC-ROLE");
  await expect(row).toContainText("30 件");
  await expect(row).toContainText("已入库");
  await expect(row).toContainText("自动流转");
  await expect(row.getByRole("checkbox")).toBeDisabled();
});

test("SALES shipping rejects pending stock, then atomically ships only accepted quantity", async ({
  page,
  request,
}) => {
  fixture = await startRoleFixture("sales");
  await forwardRealApi(page, fixture);
  const salesToken = await loginAs(page, fixture, "SALES");
  await page.goto(`/dashboard/purchase/${fixture.purchaseId}`);
  await expect(page.getByText("分批到货与验货", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "登记分批到货" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "登记验货", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/dashboard/sales/${fixture.salesId}`);
  const ship = page.getByRole("button", { name: "确认发运", exact: true });
  await expect(ship).toBeEnabled();
  const before = readDomain(fixture);
  const rejected = mutation(page, `/sales/${fixture.salesId}/status`, "PUT");
  await ship.click();
  const response = await rejected;
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("库存不足");
  await expect(page.getByText(/库存不足/)).toBeVisible();
  expect(readDomain(fixture)).toEqual(before);
  await page.reload();
  await expect(ship).toBeEnabled();
  // Warehouse releases 60 of the 100 arrived units through real authenticated HTTP.
  // Sales never writes an inspection or bypasses the failed transaction.
  const warehouse = await request.post(`${fixture.baseURL}/api/v1/auth/login`, {
    data: {
      username: fixture.users.WAREHOUSE.username,
      password: testPassword,
    },
  });
  expect(warehouse.status()).toBe(200);
  const warehouseToken = (await warehouse.json()).data.token;
  const inspected = await request.post(
    `${fixture.baseURL}/api/v1/purchases/${fixture.purchaseId}/receipts/${fixture.receiptId}/inspection`,
    {
      headers: { authorization: `Bearer ${warehouseToken}` },
      data: {
        requestId: "synthetic-sales-stock-release",
        note: "合成仓库复验后累计60件合格，其余40件继续待复验",
        items: [
          {
            receiptItemId: fixture.receiptItemId,
            acceptedQuantity: 60,
            reinspectionQuantity: 40,
          },
        ],
      },
    },
  );
  expect(inspected.status()).toBe(200);
  expect(inbound(fixture)).toBe(60);
  const shipped = mutation(page, `/sales/${fixture.salesId}/status`, "PUT");
  await ship.click();
  expect((await shipped).status()).toBe(200);
  await expect(ship).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "确认到港", exact: true }),
  ).toBeVisible();
  const domain = readDomain(fixture);
  expect(domain.sales[0].status).toBe("SHIPPED");
  expect(domain.sales[0].shippedAt).not.toBeNull();
  expect(inbound(fixture)).toBe(10);
  const outbound = domain.inventory.filter((row) => row.status === "OUTBOUND");
  expect(outbound.reduce((sum, row) => sum + row.quantity, 0)).toBe(50);
  expect(
    outbound.every(
      (row) =>
        row.salesContractId === fixture.salesId && row.outboundAt !== null,
    ),
  ).toBe(true);
  const inspectionIds = domain.inspections.map((row) => row.id);
  expect(
    domain.inventory.every((row) =>
      inspectionIds.includes(row.receiptInspectionId),
    ),
  ).toBe(true);
  expect(domain.receiptItems[0].reinspectionQuantity).toBe(40);
  // A repeated real request cannot allocate stock twice.
  const repeat = await request.put(
    `${fixture.baseURL}/api/v1/sales/${fixture.salesId}/status`,
    {
      headers: { authorization: `Bearer ${salesToken}` },
      data: { status: "SHIPPED" },
    },
  );
  expect(repeat.status()).toBe(200);
  expect(readDomain(fixture)).toEqual(domain);
  await page.goto("/dashboard/inventory-status");
  const rows = page.getByRole("row").filter({ hasText: productName });
  await expect(rows.filter({ hasText: "已出库" })).toHaveCount(outbound.length);
  await expect(rows.filter({ hasText: "已入库" })).toContainText("10 件");
});

test("BOSS reads purchase and sales UI, hides write controls and cannot mutate real state", async ({
  page,
}) => {
  fixture = await startRoleFixture("boss");
  await forwardRealApi(page, fixture);
  const token = await loginAs(page, fixture, "BOSS");
  await expect(
    page.getByRole("link", { name: "AI 助手", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/dashboard/purchase/${fixture.purchaseId}`);
  await expect(
    page.getByText("本批到货 100 · 合格 30 · 待验 0 · 待复验 70"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "登记分批到货" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "登记验货", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/dashboard/sales/${fixture.salesId}`);
  await expect(
    page.getByRole("heading", { name: fixture.salesNo, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认发运", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "从已完工采购导入" }),
  ).toHaveCount(0);
  const before = readDomain(fixture);
  const denied = await page.evaluate(
    async ({ salesId, token }) => {
      const response = await fetch(`/api/v1/sales/${salesId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "SHIPPED" }),
      });
      return { status: response.status, body: await response.json() };
    },
    { salesId: fixture.salesId, token },
  );
  expect(denied.status).toBe(403);
  expect(denied.body.message).toContain("老板角色仅可查看业务");
  expect(readDomain(fixture)).toEqual(before);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "确认发运", exact: true }),
  ).toHaveCount(0);
  expect(readDomain(fixture)).toEqual(before);
});
