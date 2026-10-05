/**
 * Input: 真实 Next 路由、390/1440px 视口与合成只读工作台/经营报表 API
 * Output: 销售明细返回、Back/Forward、刷新、草稿与期间重置验收
 * Pos: 经营中台筛选返回上下文回归；不访问生产数据或写入业务
 */
import { test, expect, type Page } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

async function mockContext(page: Page) {
  const writes: string[] = [];
  const periods: Array<{ startDate: string | null; endDate: string | null }> =
    [];
  await mockApiRoutes(page);
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
      await route.abort();
      return;
    }
    if (url.pathname === "/api/v1/dashboard/trade-workflows") {
      const scope = url.searchParams.get("scope") || "recent";
      await route.fulfill({
        json: {
          code: 200,
          data: [
            {
              id: "qa-return-context",
              contractNo: `QA-${scope}`,
              status: "PACKING",
              purchaseContractNos: [],
              completedStageCount: 0,
              stageCount: 1,
              stages: [
                {
                  key: "qa",
                  label: "合成阶段",
                  status: "blocked",
                  reason: "合成阻塞",
                },
              ],
              nextAction: {
                label: "查看合成详情",
                href: "/dashboard/sales/sc-001",
              },
              issues: [],
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/v1/reports/business-overview") {
      const period = {
        startDate: url.searchParams.get("startDate"),
        endDate: url.searchParams.get("endDate"),
      };
      periods.push(period);
      await route.fulfill({
        json: {
          code: 200,
          data: {
            period: { ...period, dateField: "shippedAt" },
            overview: {
              totalSales: 700,
              totalPurchases: 500,
              grossProfit: 200,
              profitMargin: 2 / 7,
              marginReady: true,
              cashReady: true,
              currency: "CNY",
              contractCount: period.startDate || period.endDate ? 1 : 46,
              netCashCny: 0,
              scope: "合成商品口径",
              unavailableContracts: [],
            },
            funds: {
              totalReceivable: 0,
              totalPayable: 0,
              overdueReceivable: 0,
              overduePayable: 0,
              overdueRule: "合成风险口径",
            },
            inventory: {
              totalItems: 0,
              lowStockItems: 0,
              inTransitContainers: 0,
            },
            trends: { monthlySales: [] },
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  return { writes, periods };
}

for (const width of [390, 1440]) {
  test(`工作台范围明细返回和原生历史 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await mockContext(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signInAsAdmin(page, "/dashboard?source=qa#tasks");
    await expect(page.getByText("QA-recent", { exact: true })).toBeVisible();
    const blocked = page.getByRole("button", { name: "阻塞", exact: true });
    await blocked.click();
    await expect(blocked).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("QA-blocked", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(
      /\/dashboard\?source=qa&workflowView=blocked#tasks$/,
    );
    await page.getByRole("button", { name: "查看全部", exact: true }).click();
    // 查看全部仍沿用原有未过滤销售列表；验收的是返回时的工作台范围。
    await expect(page).toHaveURL(/\/dashboard\/sales$/);
    await page.goBack();
    await expect(blocked).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("QA-blocked", { exact: true })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard\/sales$/);
    await page.goBack();
    await expect(blocked).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(blocked).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("QA-blocked", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "待处理", exact: true }).click();
    await page.getByRole("button", { name: "风险优先", exact: true }).click();
    await expect(page.getByText("QA-risk", { exact: true })).toBeVisible();
    await page.evaluate(() =>
      window.history.pushState(
        null,
        "",
        "/dashboard?source=qa&workflowView=pending#tasks",
      ),
    );
    await expect(page.getByText("QA-pending", { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText("QA-risk", { exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByText("QA-pending", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "最近更新", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?source=qa#tasks$/);
    await expect(page.getByText("QA-recent", { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`经营期间草稿、明细返回和刷新 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, periods } = await mockContext(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signInAsAdmin(page, "/dashboard/reports?source=qa#report");
    const start = page.getByLabel("发运开始日期");
    const end = page.getByLabel("发运结束日期");
    const summary = page.getByText(/^发运期间：/);
    await expect(summary).toContainText("共 46 笔");
    const initialReads = periods.length;
    await start.fill("2026-10-05");
    await end.fill("2026-10-05");
    await expect(page).toHaveURL(/\/dashboard\/reports\?source=qa#report$/);
    expect(periods).toHaveLength(initialReads);
    await expect(summary).toContainText("共 46 笔");
    await page.getByRole("button", { name: "应用期间", exact: true }).click();
    await expect(summary).toContainText("2026-10-05 至 2026-10-05，共 1 笔");
    await expect(page).toHaveURL(
      /\/dashboard\/reports\?source=qa&startDate=2026-10-05&endDate=2026-10-05#report$/,
    );
    const detail = page.getByRole("link", {
      name: "查看发运销售明细",
      exact: true,
    });
    await expect(detail).toHaveAttribute(
      "href",
      "/dashboard/sales?shipped=true&shippedFrom=2026-10-05&shippedTo=2026-10-05",
    );
    await detail.click();
    await expect(page).toHaveURL(
      /\/dashboard\/sales\?shipped=true&shippedFrom=2026-10-05&shippedTo=2026-10-05$/,
    );
    await page.goBack();
    await expect(start).toHaveValue("2026-10-05");
    await expect(end).toHaveValue("2026-10-05");
    await expect(summary).toContainText("共 1 笔");
    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard\/sales\?/);
    await page.goBack();
    await expect(start).toHaveValue("2026-10-05");
    await page.reload();
    await expect(start).toHaveValue("2026-10-05");
    await expect(summary).toContainText("共 1 笔");
    await start.fill("2026-10-06");
    await expect(
      page.getByRole("button", { name: "应用期间", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "全部期间", exact: true }).click();
    await expect(start).toHaveValue("");
    await expect(end).toHaveValue("");
    await expect(summary).toContainText("最早 至 当前，共 46 笔");
    await expect(page).toHaveURL(/\/dashboard\/reports\?source=qa#report$/);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
