/**
 * Input: Mounted workbench, real PURCHASE/BOSS login and literal migrated SQLite sources
 * Output: Two KPI/risk/task destination cases with reload and independent zero-write checks
 * Pos: Hosted dashboard acceptance; no business mocks, reports, hidden tracker UI or providers
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Page } from "@playwright/test";
import {
  forwardRealApi,
  loginAs,
  readDashboardSources,
  startRoleFixture,
  stopRoleFixture,
  type RoleFixture,
} from "./real-role-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.describe.configure({ mode: "serial" });
let fixture: RoleFixture;
let pageErrors: string[];
let writes: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  writes = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      pathname.startsWith("/api/v1/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      pathname !== "/api/v1/auth/login"
    ) {
      writes.push(`${request.method()} ${pathname}`);
    }
  });
  fixture = await startRoleFixture("dashboard-sources");
  await forwardRealApi(page, fixture);
});
test.afterEach(async () => {
  if (fixture) await stopRoleFixture(fixture);
  expect(pageErrors).toEqual([]);
  expect(writes).toEqual([]);
});

/**
 * 职责：核对当前实际挂载的指标与资金摘要，金额采用独立已知例题。
 * @param page 已完成真实登录的工作台
 * @returns 指标、账期和资金全部可见后的 Promise
 * @throws 任一实际页面读数与独立来源例题不一致
 */
async function expectWorkbenchSources(page: Page) {
  const indicators = page.locator('section[aria-label="经营指标"]');
  for (const [label, value] of [
    ["待起草采购", "2"],
    ["出口待补录", "1"],
    ["库存记录", "3"],
    ["最新账期", "合成2026年9账期"],
  ]) {
    await expect(
      indicators
        .getByText(label, { exact: true })
        .locator("..")
        .getByText(value, { exact: true }),
    ).toBeVisible();
  }
  // DERIVED 700-(250*0.7)=525; FORMAL_DOCUMENT 400-100=300. No cross-currency sum.
  await expect(page.getByText("$825", { exact: true })).toBeVisible();
  await expect(page.getByText("¥1,350", { exact: true })).toBeVisible();
  await expect(page.getByText("资金读取失败", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("专项单主线路暂时不可用，请稍后刷新。", { exact: true }),
  ).toHaveCount(0);
}

/**
 * 职责：在最近六笔之外读取真正历史风险，并验证阻塞/风险范围的实际来源。
 * @param page 当前真实工作台
 * @returns 历史风险主线路卡片的定位器
 * @throws 旧风险遗漏、取消合同出现或下一动作/风险原因不符
 */
async function selectHistoricalRisk(page: Page) {
  const sources = fixture.dashboardSources!;
  await expect(
    page.getByRole("heading", { name: sources.taskNo, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: sources.riskNo, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "阻塞", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: sources.riskNo, exact: true }),
  ).toBeVisible();
  await expect(page.locator("article")).toHaveCount(2);
  await page.getByRole("button", { name: "风险优先", exact: true }).click();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: sources.riskNo, exact: true }),
  });
  await expect(page.locator("article").first()).toContainText(sources.riskNo);
  await expect(card).toContainText("找不到购销合同 CG-SYNTHETIC-MISSING");
  await expect(
    card.getByText("货柜超过 40HQ 安全上限", { exact: true }),
  ).toBeVisible();
  await expect(card.locator('li[title="毛重超过 22 吨安全上限"]')).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("heading", { name: "EXP-SYNTHETIC-CANCELLED", exact: true }),
  ).toHaveCount(0);
  return card;
}

test("PURCHASE mounted dashboard reads literal KPIs and historical risks then opens its real next purchase task", async ({
  page,
}) => {
  test.setTimeout(90000);
  await loginAs(page, fixture, "PURCHASE");
  const before = readDashboardSources(fixture);
  expect(
    before.inventories.map((row) => [row.status, row.quantity]).sort(),
  ).toEqual(
    [
      ["IN_STOCK", 8],
      ["OUT_STOCK", 4],
      ["PRODUCING", 20],
    ].sort(),
  );
  expect(
    before.purchase_contracts
      .map((row) => [row.status, row.totalAmount, row.paidAmount])
      .sort(),
  ).toEqual(
    [
      ["DRAFT", 1130, 130],
      ["DRAFT", 200, 50],
      ["PENDING", 300, 100],
      ["CANCELLED", 900, 100],
      ["COMPLETED", 100, 100],
    ].sort(),
  );
  await expectWorkbenchSources(page);
  await selectHistoricalRisk(page);
  await page.getByRole("button", { name: "最近更新", exact: true }).click();
  const task = fixture.dashboardSources!;
  const detail = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/purchases/${fixture.purchaseId}` &&
      response.request().method() === "GET",
  );
  await page
    .getByRole("button", {
      name: `${task.taskNo} 下一步：补录采购关联与签约资料`,
      exact: true,
    })
    .click();
  expect((await detail).status()).toBe(200);
  await expect(page).toHaveURL(`/dashboard/purchase/${fixture.purchaseId}`);
  await expect(
    page.getByRole("heading", { name: task.purchaseNo, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: task.purchaseNo, exact: true }),
  ).toBeVisible();
  expect(readDashboardSources(fixture)).toEqual(before);
  await expect(page.getByText("采购合同读取失败", { exact: true })).toHaveCount(
    0,
  );
});

test("BOSS mounted dashboard reads the same sources and opens the real historical sale through its read-only task", async ({
  page,
}) => {
  test.setTimeout(90000);
  await loginAs(page, fixture, "BOSS");
  const before = readDashboardSources(fixture);
  await expectWorkbenchSources(page);
  await expect(
    page.getByRole("button", { name: "新建采购合同", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "新建出口合同", exact: true }),
  ).toHaveCount(0);
  const card = await selectHistoricalRisk(page);
  const task = fixture.dashboardSources!;
  const detail = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/sales/${task.riskId}` &&
      response.request().method() === "GET",
  );
  await card
    .getByRole("button", { name: `${task.riskNo} 查看专项单详情`, exact: true })
    .click();
  expect((await detail).status()).toBe(200);
  await expect(page).toHaveURL(`/dashboard/sales/${task.riskId}`);
  await expect(
    page.getByRole("heading", { name: task.riskNo, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: task.riskNo, exact: true }),
  ).toBeVisible();
  expect(readDashboardSources(fixture)).toEqual(before);
  await expect(page.getByText("页面出现异常", { exact: true })).toHaveCount(0);
});
