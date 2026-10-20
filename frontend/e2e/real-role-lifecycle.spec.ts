/** Real role UI + Express/SQLite acceptance. Hosted Playwright is the browser gate. */
import { test, expect, type Page } from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  readDomain,
  readPurchaseNotifications,
  readTaxRecords,
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

// Six bounded internal-record scenarios. Draft status throughout; no filing,
// confirmation, exports, uploads, money movement or external provider actions.
const customsDraft = {
  报关单号: "CD-SYNTHETIC-FORM-NEW",
  报关行: "合成内部报关行新草稿",
  申报日期: "2026-10-02",
  出口日期: "2026-10-03",
  成交币种: "USD",
  汇率: "7.2",
  货值总额: "200",
  申报总数量: "20",
  "毛重（kg）": "24",
  "净重（kg）": "20",
  备注: "合成报关新建草稿",
  申报品名: "合成内部表单商品",
  "HS 编码": "9999999999",
  数量: "20",
  单位: "件",
  单价: "10",
  金额: "200",
  申报要素: "合成新建申报要素",
};
const refundDraft = {
  退税单号: "TR-SYNTHETIC-FORM-NEW",
  申请日期: "2026-10-02",
  申报金额: "200",
  可退金额: "26",
  已退金额: "0",
  到账日期: "",
  备注: "合成退税新建草稿",
};
async function assertFormValues(page: Page, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  }
}
async function fillTaxRecordDraft(
  page: Page,
  kind: "customs" | "refunds",
  number?: string,
) {
  const seed = fixture.taxRecords!;
  await expect(
    page.getByRole("combobox", { name: "出口合同", exact: true }),
  ).toBeEnabled();
  await page.getByRole("combobox", { name: "出口合同", exact: true }).click();
  await page
    .getByRole("option", { name: seed.contractNo, exact: true })
    .click();
  if (kind === "customs") {
    await page.getByRole("combobox", { name: "商品档案", exact: true }).click();
    await page.getByRole("option", { name: productName, exact: true }).click();
  } else {
    await expect(
      page.getByRole("combobox", { name: "报关单", exact: true }),
    ).toBeEnabled();
    await page.getByRole("combobox", { name: "报关单", exact: true }).click();
    await page
      .getByRole("option", { name: seed.customsNo, exact: true })
      .click();
  }
  const values =
    kind === "customs"
      ? { ...customsDraft, 报关单号: number || customsDraft.报关单号 }
      : { ...refundDraft, 退税单号: number || refundDraft.退税单号 };
  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await assertFormValues(page, values);
  await expect(
    page.getByRole("combobox", { name: "状态", exact: true }),
  ).toContainText("草稿");
  return values;
}
for (const kind of ["customs", "refunds"] as const) {
  const pathname =
    kind === "customs" ? "/customs-declarations" : "/tax-refunds";
  const numberLabel = kind === "customs" ? "报关单号" : "退税单号";
  const editLabel = kind === "customs" ? "编辑报关单" : "编辑退税单";
  const listURL =
    kind === "customs"
      ? /\/dashboard\/tax-refunds\?view=customs$/
      : /\/dashboard\/tax-refunds$/;

  test(`FINANCE ${kind} unsaved create return cancels with zero record or audit writes`, async ({
    page,
  }) => {
    fixture = await startRoleFixture("tax-record-forms");
    await forwardRealApi(page, fixture);
    await loginAs(page, fixture, "FINANCE");
    const before = readTaxRecords(fixture);
    let writes = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.startsWith(`/api/v1${pathname}`) &&
        ["POST", "PUT", "DELETE"].includes(request.method())
      )
        writes += 1;
    });
    await page.goto(`/dashboard${pathname}/create`);
    await fillTaxRecordDraft(page, kind);
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page).toHaveURL(listURL);
    expect(readTaxRecords(fixture)).toEqual(before);
    expect(writes).toBe(0);
    await page.reload();
    await page.goto(`/dashboard${pathname}/create`);
    await expect(page.getByLabel(numberLabel, { exact: true })).toHaveValue("");
    await expect(page.getByLabel("备注", { exact: true })).toHaveValue("");
    expect(readTaxRecords(fixture)).toEqual(before);
    expect(writes).toBe(0);
  });

  test(`FINANCE ${kind} real create failure retains draft, corrected retry persists and edited save survives reload`, async ({
    page,
  }) => {
    fixture = await startRoleFixture("tax-record-forms");
    await forwardRealApi(page, fixture);
    await loginAs(page, fixture, "FINANCE");
    const seed = fixture.taxRecords!;
    const before = readTaxRecords(fixture);
    await page.goto(`/dashboard${pathname}/create`);
    const values = await fillTaxRecordDraft(
      page,
      kind,
      kind === "customs" ? seed.customsNo : seed.refundNo,
    );
    const rejected = mutation(page, pathname);
    await page
      .getByRole("button", { name: "保存并查看详情", exact: true })
      .click();
    expect((await rejected).status()).toBe(500); // Genuine unique-key rejection, no mock error.
    await expect(
      page.getByText(
        kind === "customs" ? "创建报关单失败" : "创建退税记录失败",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "保存并查看详情", exact: true }),
    ).toBeEnabled();
    await assertFormValues(page, values);
    await expect(
      page.getByRole("combobox", { name: "出口合同", exact: true }),
    ).toContainText(seed.contractNo);
    if (kind === "customs")
      await expect(
        page.getByRole("combobox", { name: "商品档案", exact: true }),
      ).toContainText(productName);
    else
      await expect(
        page.getByRole("combobox", { name: "报关单", exact: true }),
      ).toContainText(seed.customsNo);
    expect(readTaxRecords(fixture)).toEqual(before);

    const number =
      kind === "customs" ? customsDraft.报关单号 : refundDraft.退税单号;
    await page.getByLabel(numberLabel, { exact: true }).fill(number);
    const created = mutation(page, pathname);
    await page
      .getByRole("button", { name: "保存并查看详情", exact: true })
      .click();
    const response = await created;
    expect(response.status()).toBe(201);
    const id = (await response.json()).data.id as string;
    await expect(page).toHaveURL(`/dashboard${pathname}/${id}`);
    await expect(
      page.getByRole("heading", { name: number, exact: true }),
    ).toBeVisible();
    await expect.poll(() => readTaxRecords(fixture).audit.length).toBe(1);
    const saved = readTaxRecords(fixture);
    expect(saved.customs).toHaveLength(kind === "customs" ? 2 : 1);
    expect(saved.refunds).toHaveLength(kind === "refunds" ? 2 : 1);
    expect(saved.audit[0]).toMatchObject({
      action: "CREATE",
      entityId: id,
      userId: fixture.users.FINANCE.id,
    });
    let itemId: string | undefined;
    if (kind === "customs") {
      expect(saved.customs.find((row) => row.id === id)).toMatchObject({
        declarationNo: number,
        salesContractId: seed.contractId,
        status: "DRAFT",
        declaredAt: Date.parse("2026-10-02T00:00:00.000Z"),
        exportDate: Date.parse("2026-10-03T00:00:00.000Z"),
        note: customsDraft.备注,
        totalAmount: 200,
        totalQuantity: 20,
      });
      const item = saved.items.find((row) => row.customsDeclarationId === id)!;
      itemId = item.id;
      expect(item).toMatchObject({
        productId: fixture.productId,
        customsName: customsDraft.申报品名,
        quantity: 20,
        unitPrice: 10,
        totalPrice: 200,
        declarationElements: customsDraft.申报要素,
      });
    } else {
      expect(saved.refunds.find((row) => row.id === id)).toMatchObject({
        refundNo: number,
        salesContractId: seed.contractId,
        customsDeclarationId: seed.customsId,
        status: "DRAFT",
        declaredAmount: 200,
        refundableAmount: 26,
        refundedAmount: 0,
        appliedAt: Date.parse("2026-10-02T00:00:00.000Z"),
        refundedAt: null,
        note: refundDraft.备注,
      });
    }
    await page.reload();
    await expect(
      page.getByRole("heading", { name: number, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        kind === "customs" ? customsDraft.备注 : refundDraft.备注,
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: editLabel, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "保存变更", exact: true }),
    ).toBeEnabled();
    await assertFormValues(page, { ...values, [numberLabel]: number }); // Real API ISO dates must display correctly.
    const note = "合成内部记录编辑后备注";
    await page.getByLabel("备注", { exact: true }).fill(note);
    const updated = mutation(page, `${pathname}/${id}`, "PUT");
    await page.getByRole("button", { name: "保存变更", exact: true }).click();
    expect((await updated).status()).toBe(200);
    await expect(page).toHaveURL(`/dashboard${pathname}/${id}`);
    await page.reload();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect.poll(() => readTaxRecords(fixture).audit.length).toBe(2);
    const edited = readTaxRecords(fixture);
    expect(edited.audit[1]).toMatchObject({
      action: "UPDATE",
      entityId: id,
      userId: fixture.users.FINANCE.id,
    });
    const oldRecord = (kind === "customs" ? saved.customs : saved.refunds).find(
      (row) => row.id === id,
    )!;
    const newRecord = (
      kind === "customs" ? edited.customs : edited.refunds
    ).find((row) => row.id === id)!;
    expect(newRecord).toMatchObject({
      ...oldRecord,
      note,
      updatedAt: expect.any(Number),
    });
    if (kind === "customs") {
      expect(edited.items.find((row) => row.id === itemId)).toMatchObject({
        ...saved.items.find((row) => row.id === itemId),
        updatedAt: expect.any(Number),
      });
    }
    await page.getByRole("button", { name: editLabel, exact: true }).click();
    await assertFormValues(page, {
      ...values,
      [numberLabel]: number,
      备注: note,
    });
    expect(readTaxRecords(fixture)).toEqual(edited);
  });

  test(`FINANCE ${kind} unsaved edit return preserves saved record and reopening restores dates and inputs`, async ({
    page,
  }) => {
    fixture = await startRoleFixture("tax-record-forms");
    await forwardRealApi(page, fixture);
    await loginAs(page, fixture, "FINANCE");
    const id =
      kind === "customs"
        ? fixture.taxRecords!.customsId
        : fixture.taxRecords!.refundId;
    const before = readTaxRecords(fixture);
    let writes = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.startsWith(`/api/v1${pathname}`) &&
        ["POST", "PUT", "DELETE"].includes(request.method())
      )
        writes += 1;
    });
    await page.goto(`/dashboard${pathname}/${id}/edit`);
    await expect(
      page.getByRole("button", { name: "保存变更", exact: true }),
    ).toBeEnabled();
    const dateLabel = kind === "customs" ? "申报日期" : "申请日期";
    const originalNote =
      kind === "customs" ? "合成报关已保存备注" : "合成退税已保存备注";
    await expect(page.getByLabel(dateLabel, { exact: true })).toHaveValue(
      "2026-10-01",
    );
    await expect(
      page.getByLabel(kind === "customs" ? "出口日期" : "到账日期", {
        exact: true,
      }),
    ).toHaveValue("");
    await page.getByLabel("备注", { exact: true }).fill("合成编辑取消草稿");
    await page.getByLabel(dateLabel, { exact: true }).fill("2026-10-04");
    await page
      .getByLabel(kind === "customs" ? "货值总额" : "申报金额", { exact: true })
      .fill("999");
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(page).toHaveURL(`/dashboard${pathname}/${id}`);
    await expect(page.getByText(originalNote, { exact: true })).toBeVisible();
    expect(readTaxRecords(fixture)).toEqual(before);
    expect(writes).toBe(0);
    await page.reload();
    await page.getByRole("button", { name: editLabel, exact: true }).click();
    await expect(page.getByLabel("备注", { exact: true })).toHaveValue(
      originalNote,
    );
    await expect(page.getByLabel(dateLabel, { exact: true })).toHaveValue(
      "2026-10-01",
    );
    await expect(
      page.getByLabel(kind === "customs" ? "货值总额" : "申报金额", {
        exact: true,
      }),
    ).toHaveValue("100");
    expect(readTaxRecords(fixture)).toEqual(before);
    expect(writes).toBe(0);
  });
}
