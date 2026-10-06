/**
 * Input: Production frontend, real existing-role auth/local HS API and private SQLite
 * Output: Four hosted search/detail/cancel/evidence-save/readback acceptance cases
 * Pos: Ordinary local HS catalogue QA; excludes AI-only copy and provider routes
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  forwardHsApi,
  loginHsAs,
  readHsSnapshot,
  startHsFixture,
  stopHsFixture,
  type HsFixture,
  type HsRole,
  type HsSnapshot,
} from "./real-hs-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.describe.configure({ mode: "serial" });
let fixture: HsFixture;
let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  fixture = await startHsFixture();
  await forwardHsApi(page, fixture);
});
test.afterEach(async () => {
  if (fixture) await stopHsFixture(fixture);
  expect(pageErrors).toEqual([]);
});

/**
 * 职责：真实登录后从出口菜单进入已有HS页签。
 * @param page 当前浏览器页面
 * @param role 当前既有角色；默认采购
 * @returns 当前合成用户测试令牌
 * @throws 登录、菜单或页签导航失败
 */
async function enterHs(page: Page, role: HsRole = "PURCHASE") {
  const token = await loginHsAs(page, fixture, role);
  await page.getByRole("link", { name: "出口", exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/sales$/);
  await page.getByRole("link", { name: "HS 编码", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/hs-codes/);
  await expect(
    page.getByRole("cell", { name: fixture.productName, exact: true }),
  ).toBeVisible();
  return token;
}

/**
 * 职责：点击实际列表记录打开本地详情，确认原始申报要素。
 * @param page 当前字典列表页面
 * @returns 详情展示完成的 Promise<void>
 * @throws 行定位、返回入口或字典要素断言失败
 */
async function openDetail(page: Page) {
  await page
    .getByRole("cell", { name: fixture.productName, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "返回列表", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("品牌类型", { exact: true })).toBeVisible();
  await expect(page.getByText("合成已保存备注", { exact: true })).toBeVisible();
}
/**
 * 职责：定位当前现有人工证据弹窗。
 * @param page 当前HS验收页面
 * @returns 具名dialog定位器
 */
const dialogFor = (page: Page) =>
  page.getByRole("dialog", { name: "人工更新 HS 税则证据" });
const savedValues = {
  refund: "3.5",
  export: "0",
  vat: "13",
  date: "2026-01-01",
  source: "https://example.invalid/hs/synthetic-original",
  elements: "品牌类型|用途",
  note: "合成已保存备注",
};
const revisedValues = {
  refund: "0",
  export: "4.25",
  vat: "9",
  date: "2026-10-03",
  source: "https://example.invalid/hs/synthetic-reviewed",
  elements: "合成复核用途|合成复核材质",
  note: "合成采购已复核",
};
type EvidenceValues = typeof savedValues;

/**
 * 职责：核对所有现有手工证据输入值。
 * @param dialog 当前人工证据弹窗
 * @param values 合成已保存或草稿字面量
 * @returns 所有字段断言完成的 Promise<void>
 */
async function expectValues(dialog: Locator, values: EvidenceValues) {
  await expect(dialog.getByLabel("出口退税率（%）")).toHaveValue(values.refund);
  await expect(dialog.getByLabel("出口税率（%）")).toHaveValue(values.export);
  await expect(dialog.getByLabel("增值税率（%）")).toHaveValue(values.vat);
  await expect(dialog.getByLabel("生效日期")).toHaveValue(values.date);
  await expect(dialog.getByLabel("官方来源链接")).toHaveValue(values.source);
  await expect(dialog.getByLabel("申报要素模板")).toHaveValue(values.elements);
  await expect(dialog.getByLabel("复核备注")).toHaveValue(values.note);
}

/**
 * 职责：填写全部已有人工证据字段，不新增税则字段或规则。
 * @param page 当前已打开弹窗的页面
 * @param source 合成来源链接；可用无效链接触发真正后端400
 * @returns 填写完成的 Promise<void>
 */
async function fillEvidence(page: Page, source = revisedValues.source) {
  const dialog = dialogFor(page);
  await dialog.getByLabel("出口退税率（%）").fill(revisedValues.refund);
  await dialog.getByLabel("出口税率（%）").fill(revisedValues.export);
  await dialog.getByLabel("增值税率（%）").fill(revisedValues.vat);
  await dialog.getByLabel("生效日期").fill(revisedValues.date);
  await dialog.getByLabel("官方来源链接").fill(source);
  await dialog.getByLabel("申报要素模板").fill(revisedValues.elements);
  await dialog.getByLabel("复核备注").fill(revisedValues.note);
}
/**
 * 职责：等待当前编码的真实手工PUT响应。
 * @param page 当前已打开证据弹窗的页面
 * @returns 真正后端更新响应的Promise
 */
const updateResponse = (page: Page) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/hs-codes/${fixture.hsCode}` &&
      response.request().method() === "PUT",
  );

/**
 * 职责：直接与独立字面量核对保存后的完整HS行及其他业务守恒。
 * @param before 本次保存前的独立只读SQLite快照
 * @param after 本次保存后的独立只读SQLite快照
 * @returns 无；完成独立持久化与真实采购审计断言
 */
function assertEvidenceSaved(before: HsSnapshot, after: HsSnapshot) {
  const original = before.hs_codes.find(
    (row) => row.hsCode === fixture.hsCode,
  )!;
  const row = after.hs_codes.find(
    (record) => record.hsCode === fixture.hsCode,
  )!;
  expect(row).toEqual({
    ...original,
    refundRate: 0,
    exportTaxRate: 4.25,
    vatRate: 9,
    effectiveDate: 1790985600000,
    sourceUrl: revisedValues.source,
    declarationElements: revisedValues.elements,
    note: revisedValues.note,
    fetchedAt: row.fetchedAt,
  });
  expect(Number.isFinite(row.fetchedAt)).toBe(true);
  expect(
    after.hs_codes.filter((record) => record.hsCode !== fixture.hsCode),
  ).toEqual(
    before.hs_codes.filter((record) => record.hsCode !== fixture.hsCode),
  );
  for (const table of Object.keys(before).filter(
    (table) => !["hs_codes", "operation_logs"].includes(table),
  ))
    expect(after[table]).toEqual(before[table]);
  expect(after.operation_logs).toHaveLength(1);
  expect(after.operation_logs[0]).toMatchObject({
    entity: "HsCode",
    entityId: fixture.hsCode,
    action: "UPDATE",
    userId: fixture.users.PURCHASE.id,
  });
}

test("local HS search distinguishes numeric prefix, intersects name, opens detail and preserves filters on return/reload", async ({
  page,
}) => {
  await enterHs(page);
  const before = readHsSnapshot(fixture);
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).pathname.startsWith("/api/v1/")
    )
      writes += 1;
  });
  await page.getByPlaceholder("编码前缀（4–10位）").fill("999901");
  await expect(page).toHaveURL(/code=999901/);
  await expect(
    page.getByRole("cell", { name: "合成999901名称", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "合成本地编码乙", exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("商品名称（支持模糊匹配）").fill("编码甲");
  await expect(
    page.getByRole("cell", { name: "合成本地编码乙", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: fixture.productName, exact: true }),
  ).toBeVisible();
  await openDetail(page);
  // The two existing copy controls belong only to excluded AI result interfaces.
  await expect(
    page.getByRole("button", { name: "复制报关格式", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await expect(page.getByPlaceholder("编码前缀（4–10位）")).toHaveValue(
    "999901",
  );
  await expect(page.getByPlaceholder("商品名称（支持模糊匹配）")).toHaveValue(
    "编码甲",
  );
  await page.reload();
  await expect(
    page.getByRole("cell", { name: fixture.productName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "合成本地编码乙", exact: true }),
  ).toHaveCount(0);
  expect(readHsSnapshot(fixture)).toEqual(before);
  expect(writes).toBe(0);
});

test("local HS manual evidence cancel/Escape/reopen/reload discards complete draft with zero writes", async ({
  page,
}) => {
  await enterHs(page);
  await openDetail(page);
  const before = readHsSnapshot(fixture);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT") writes += 1;
  });
  for (const cancel of ["button", "escape"] as const) {
    await page
      .getByRole("button", { name: "人工更新税则", exact: true })
      .click();
    await expectValues(dialogFor(page), savedValues);
    await fillEvidence(page);
    if (cancel === "button")
      await dialogFor(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
    else await page.keyboard.press("Escape");
    await expect(dialogFor(page)).toHaveCount(0);
    expect(readHsSnapshot(fixture)).toEqual(before);
  }
  await page.reload();
  await openDetail(page);
  await page.getByRole("button", { name: "人工更新税则", exact: true }).click();
  await expectValues(dialogFor(page), savedValues);
  expect(readHsSnapshot(fixture)).toEqual(before);
  expect(writes).toBe(0);
});

test("local HS genuine evidence failure retains draft, corrected save blocks repeats and persists through API/list/reload", async ({
  page,
}) => {
  const token = await enterHs(page);
  await openDetail(page);
  const before = readHsSnapshot(fixture);
  await page.getByRole("button", { name: "人工更新税则", exact: true }).click();
  await fillEvidence(page, "invalid-source");
  const rejected = updateResponse(page);
  await dialogFor(page)
    .getByRole("button", { name: "保存税则证据", exact: true })
    .click();
  expect((await rejected).status()).toBe(400);
  await expectValues(dialogFor(page), {
    ...revisedValues,
    source: "invalid-source",
  });
  await expect(
    dialogFor(page).getByRole("button", { name: "保存税则证据", exact: true }),
  ).toBeEnabled();
  expect(readHsSnapshot(fixture)).toEqual(before);
  await dialogFor(page).getByLabel("官方来源链接").fill(revisedValues.source);
  let writes = 0;
  let release!: () => void;
  let persisted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reachedBackend = new Promise<void>((resolve) => {
    persisted = resolve;
  });
  await page.route(`**/api/v1/hs-codes/${fixture.hsCode}`, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes += 1;
    const response = await route.fetch({
      url: `${fixture.baseURL}/api/v1/hs-codes/${fixture.hsCode}`,
      maxRedirects: 0,
    });
    persisted();
    await gate;
    await route.fulfill({ response }); // Delay an unchanged genuine response only.
  });
  const savedResponse = updateResponse(page);
  await dialogFor(page)
    .getByRole("button", { name: "保存税则证据", exact: true })
    .click();
  await reachedBackend;
  const save = dialogFor(page).getByRole("button", {
    name: "保存税则证据",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await expect(
    dialogFor(page).getByRole("button", { name: "取消", exact: true }),
  ).toBeDisabled();
  await save.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  expect(writes).toBe(1);
  release();
  expect((await savedResponse).status()).toBe(200);
  await expect(dialogFor(page)).toHaveCount(0);
  await expect(
    page.getByText(revisedValues.note, { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readHsSnapshot(fixture).operation_logs.length)
    .toBe(1);
  const after = readHsSnapshot(fixture);
  assertEvidenceSaved(before, after);
  const readback = await page.evaluate(
    async ({ code, token }) => {
      const response = await fetch(`/api/v1/hs-codes/${code}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return { status: response.status, body: await response.json() };
    },
    { code: fixture.hsCode, token },
  );
  expect(readback.status).toBe(200);
  expect(readback.body.data).toMatchObject({
    refundRate: 0,
    exportTaxRate: 4.25,
    vatRate: 9,
    note: revisedValues.note,
    effectiveDate: "2026-10-03T00:00:00.000Z",
  });
  await page.getByRole("button", { name: "返回列表", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: fixture.productName }),
  ).toContainText("0%");
  await page.reload();
  await page
    .getByRole("cell", { name: fixture.productName, exact: true })
    .click();
  await page.getByRole("button", { name: "人工更新税则", exact: true }).click();
  await expectValues(dialogFor(page), revisedValues);
  expect(readHsSnapshot(fixture)).toEqual(after);
  expect(writes).toBe(1);
});

test("BOSS local HS search/detail remains readable while existing manual edit route rejects without writes", async ({
  page,
}) => {
  const token = await enterHs(page, "BOSS");
  await openDetail(page);
  const before = readHsSnapshot(fixture);
  await expect(
    page.getByRole("button", { name: "人工更新税则", exact: true }),
  ).toHaveCount(0);
  const denied = await page.evaluate(
    async ({ code, token }) => {
      const response = await fetch(`/api/v1/hs-codes/${code}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note: "合成只读角色拒绝写入" }),
      });
      return response.status;
    },
    { code: fixture.hsCode, token },
  );
  expect(denied).toBe(403);
  expect(readHsSnapshot(fixture)).toEqual(before);
});
