/**
 * Input: Production frontend, real SALES auth/Express and private committed-migration SQLite
 * Output: Four header cancel/save/failure-retry/reload browser acceptance cases
 * Pos: Hosted sales header supplement checks; no business response mocks or production access
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  forwardRealApi,
  loginAs,
  readSalesHeader,
  startRoleFixture,
  stopRoleFixture,
  type ExportDocumentSnapshot,
  type RoleFixture,
} from "./real-role-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.describe.configure({ mode: "serial" });
let fixture: RoleFixture;
let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  fixture = await startRoleFixture("sales-header");
  await forwardRealApi(page, fixture);
});
test.afterEach(async () => {
  if (fixture) await stopRoleFixture(fixture);
  expect(pageErrors).toEqual([]);
});

/**
 * 职责：真实 SALES 登录后经唯一出口菜单打开已有合同头信息。
 * @param page 当前验收页面，已透传到独占真实后端
 * @returns 当前合成 SALES 用户的登录令牌
 * @throws 登录身份、菜单导航或合同信息入口断言失败
 */
async function enterHeader(page: Page) {
  const token = await loginAs(page, fixture, "SALES");
  await page.getByRole("link", { name: "出口", exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/sales$/);
  await page
    .getByRole("button", { name: `查看合同 ${fixture.salesNo}`, exact: true })
    .click();
  await expect(page).toHaveURL(`/dashboard/sales/${fixture.salesId}`);
  await page.getByRole("tab", { name: "合同信息", exact: true }).click();
  return token;
}
/**
 * 职责：定位当前详情页的合同信息页签面板。
 * @param page 当前合同详情验收页面
 * @returns 合同信息 tabpanel 定位器
 */
const panelFor = (page: Page) =>
  page.getByRole("tabpanel", { name: "合同信息" });
const savedValues = {
  rate: "7.2",
  signedAt: "2026-10-01",
  arrival: "2026-11-01",
  port: "合成角色验收港口",
};
const draftValues = {
  rate: "7.4",
  signedAt: "2026-10-03",
  arrival: "2026-11-03",
  port: "合成合同头补充港口",
};

/**
 * 职责：核对全部现有头字段，不添加新业务字段。
 * @param panel 当前合同信息编辑面板
 * @param values 预期的汇率、日期和目的港显示值
 * @returns 完成四项输入断言的 Promise<void>
 * @throws 任一输入或目的港显示值不符合预期
 */
async function expectValues(panel: Locator, values: typeof savedValues) {
  await expect(panel.getByLabel("汇率", { exact: true })).toHaveValue(
    values.rate,
  );
  await expect(panel.getByLabel("签订日期", { exact: true })).toHaveValue(
    values.signedAt,
  );
  await expect(panel.getByLabel("预计到达", { exact: true })).toHaveValue(
    values.arrival,
  );
  await expect(
    panel.getByRole("combobox", { name: "目的港", exact: true }),
  ).toContainText(values.port);
}
/**
 * 职责：修改全部四项已有头输入，用真实门店/港口选择资料。
 * @param page 当前处于头编辑状态的合同详情页面
 * @param rate 合成汇率输入，默认普通草稿汇率
 * @returns 填写并核对完整头草稿的 Promise<void>
 * @throws 输入不可操作、港口选项缺失或草稿断言失败
 */
async function fillDraft(page: Page, rate = draftValues.rate) {
  const panel = panelFor(page);
  await panel.getByLabel("汇率", { exact: true }).fill(rate);
  await panel
    .getByLabel("签订日期", { exact: true })
    .fill(draftValues.signedAt);
  await panel.getByLabel("预计到达", { exact: true }).fill(draftValues.arrival);
  await panel.getByRole("combobox", { name: "目的港", exact: true }).click();
  await page
    .getByRole("option", { name: draftValues.port, exact: true })
    .click();
  await expectValues(panel, { ...draftValues, rate });
}
/**
 * 职责：等待当前合成合同的真实普通头更新响应。
 * @param page 将明确点击保存的当前验收页面
 * @returns 当前合同 PUT 响应的 Promise<Response>
 * @throws 等待响应超时
 */
function updateResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sales/${fixture.salesId}` &&
      response.request().method() === "PUT",
  );
}
/**
 * 职责：独立 SQLite 核对仅四项头资料及更新时间改变，其余业务事实不变。
 * 思路：核对合同头变化，再逐表核对守恒和唯一真实 SALES 审计。
 * @param before 保存前的独立 SQLite 快照
 * @param after 保存后的独立 SQLite 快照
 * @returns 无；完成合同头、无关业务事实和审计断言
 * @throws 字段、业务行或审计操作者不符合预期
 */
function assertConserved(
  before: ExportDocumentSnapshot,
  after: ExportDocumentSnapshot,
) {
  // 0. 仅允许四项既有头字段及更新时间变化。
  expect(after.sales_contracts).toEqual([
    {
      ...before.sales_contracts[0],
      exchangeRate: 7.4,
      signedAt: Date.parse(draftValues.signedAt),
      estimatedArrival: Date.parse(draftValues.arrival),
      portId: fixture.salesHeader!.nextPortId,
      updatedAt: expect.any(Number),
    },
  ]);
  // 1. 其他业务表逐行守恒，并核对唯一真实操作者审计。
  for (const table of Object.keys(before)) {
    if (!["sales_contracts", "audit"].includes(table))
      expect(after[table], table).toEqual(before[table]);
  }
  expect(after.audit).toHaveLength(1);
  expect(after.audit[0]).toMatchObject({
    entityId: fixture.salesId,
    action: "UPDATE",
    userId: fixture.users.SALES.id,
  });
}
/**
 * 职责：明确保存当前草稿并等待真实成功、编辑关闭和唯一审计落库。
 * @param page 当前已填写完整头草稿的验收页面
 * @returns 完成成功响应、界面和审计断言的 Promise<void>
 * @throws 响应非 200、编辑未关闭或审计数量不为一
 */
async function saveDraft(page: Page) {
  const response = updateResponse(page);
  await panelFor(page)
    .getByRole("button", { name: "保存", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(
    panelFor(page).getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect.poll(() => readSalesHeader(fixture).audit.length).toBe(1);
}

test("SALES header cancel discards full draft, reopen and reload produce zero business writes", async ({
  page,
}) => {
  await enterHeader(page);
  const before = readSalesHeader(fixture);
  let writes = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/v1/") &&
      ["POST", "PUT", "DELETE"].includes(request.method())
    )
      writes += 1;
  });
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expectValues(panelFor(page), savedValues);
  await fillDraft(page);
  await panelFor(page)
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(readSalesHeader(fixture)).toEqual(before);
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expectValues(panelFor(page), savedValues);
  expect(writes).toBe(0);
  await page.reload();
  await page.getByRole("tab", { name: "合同信息", exact: true }).click();
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expectValues(panelFor(page), savedValues);
  expect(readSalesHeader(fixture)).toEqual(before);
  expect(writes).toBe(0);
});

test("SALES header ordinary supplement saves once while pending and conserves amounts and packing facts", async ({
  page,
}) => {
  await enterHeader(page);
  const before = readSalesHeader(fixture);
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await fillDraft(page);
  let writes = 0;
  let release!: () => void;
  let persisted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reachedBackend = new Promise<void>((resolve) => {
    persisted = resolve;
  });
  // Delay delivery of an unchanged genuine success, never replace its content.
  await page.route(`**/api/v1/sales/${fixture.salesId}`, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes += 1;
    const response = await route.fetch({
      url: `${fixture.baseURL}/api/v1/sales/${fixture.salesId}`,
      maxRedirects: 0,
    });
    persisted();
    await gate;
    await route.fulfill({ response });
  });
  const response = updateResponse(page);
  await panelFor(page)
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await reachedBackend;
  await expect(
    panelFor(page).getByRole("button", { name: "保存中...", exact: true }),
  ).toBeDisabled();
  await expect(
    panelFor(page).getByRole("button", { name: "取消", exact: true }),
  ).toBeDisabled();
  await panelFor(page)
    .getByRole("button", { name: "保存中...", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  expect(writes).toBe(1);
  release();
  expect((await response).status()).toBe(200);
  await expect(
    panelFor(page).getByRole("button", { name: "编辑", exact: true }),
  ).toBeVisible();
  await expect.poll(() => readSalesHeader(fixture).audit.length).toBe(1);
  assertConserved(before, readSalesHeader(fixture));
  expect(writes).toBe(1);
});

test("SALES header genuine save failure retains all draft fields and corrected explicit retry saves once", async ({
  page,
}) => {
  await enterHeader(page);
  const before = readSalesHeader(fixture);
  let writes = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === `/api/v1/sales/${fixture.salesId}` &&
      request.method() === "PUT"
    )
      writes += 1;
  });
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await fillDraft(page, "0");
  const rejected = updateResponse(page);
  await panelFor(page)
    .getByRole("button", { name: "保存", exact: true })
    .click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByText("汇率必须为正数", { exact: true })).toBeVisible();
  await expect(
    panelFor(page).getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await expectValues(panelFor(page), { ...draftValues, rate: "0" });
  expect(readSalesHeader(fixture)).toEqual(before);
  expect(writes).toBe(1);
  await panelFor(page).getByLabel("汇率", { exact: true }).fill("7.4");
  await expectValues(panelFor(page), draftValues);
  await saveDraft(page);
  assertConserved(before, readSalesHeader(fixture));
  expect(writes).toBe(2);
});

test("SALES header saved supplement survives authenticated readback, page reload and later canceled edit", async ({
  page,
}) => {
  const token = await enterHeader(page);
  const before = readSalesHeader(fixture);
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await fillDraft(page);
  await saveDraft(page);
  const saved = readSalesHeader(fixture);
  assertConserved(before, saved);
  const readback = await page.evaluate(
    async ({ id, token }) => {
      const response = await fetch(`/api/v1/sales/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return { status: response.status, body: await response.json() };
    },
    { id: fixture.salesId!, token },
  );
  expect(readback.status).toBe(200);
  expect(readback.body.data).toMatchObject({
    exchangeRate: 7.4,
    signedAt: "2026-10-03T00:00:00.000Z",
    estimatedArrival: "2026-11-03T00:00:00.000Z",
    portId: fixture.salesHeader!.nextPortId,
    totalAmount: 20,
    receivedAmount: 5,
    totalBoxes: 2,
    grossWeight: 20,
    netWeight: 18,
    volume: 0.2,
  });
  expect(readback.body.data.packingItems[0].id).toBe(
    before.packing_items[0].id,
  );
  await page.reload();
  await page.getByRole("tab", { name: "合同信息", exact: true }).click();
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expectValues(panelFor(page), draftValues);
  await panelFor(page).getByLabel("汇率", { exact: true }).fill("9.9");
  await panelFor(page)
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await panelFor(page)
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await expectValues(panelFor(page), draftValues);
  expect(readSalesHeader(fixture)).toEqual(saved);
});
