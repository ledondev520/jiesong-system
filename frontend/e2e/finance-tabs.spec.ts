/**
 * Input: 财务页签（应收/应付）、合成 /finance/payables、/finance/receivables、/finance/stats
 * Output: 页签可达，应付页顶部合计等于统计接口（J8 单一口径），行内登记入口只在有余额时出现
 * Pos: J26 财务页签验收；所有请求都是按测试隔离的路由模拟
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test, type Route } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, message: "ok", data }) });
const list = (items: unknown[]) => ({ items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } });

test.describe("finance tabs", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("payable page total equals the stats endpoint and only open contracts can be paid", async ({ page }) => {
    await mockApiRoutes(page);
    await page.route("**/api/v1/finance/stats", (route) => reply(route, { payable: { total: 1000, paid: 400, unpaid: 600 }, receivable: { total: 0, received: 0, unreceived: 0 } }));
    await page.route("**/api/v1/finance/payables**", (route) => reply(route, list([
      { id: "p1", contractNo: "CG2600001", status: "SIGNED", totalAmount: 1000, paidAmount: 400, unpaidAmount: 600, supplier: { id: "s1", name: "合成供应商" } },
    ])));
    await signInAsAdmin(page, "/dashboard/finance/payable");
    await expect(page.getByRole("heading", { name: "应付" })).toBeVisible();
    await expect(page.getByTestId("open-total")).toHaveText("¥600.00");
    await expect(page.getByText("CG2600001")).toBeVisible();
    await expect(page.getByRole("button", { name: "登记付款" })).toHaveCount(1);
  });

  test("the finance tab strip reaches 应收 and 应付", async ({ page }) => {
    await mockApiRoutes(page);
    await page.route("**/api/v1/finance/stats", (route) => reply(route, { payable: { total: 0, paid: 0, unpaid: 0 }, receivable: { total: 0, received: 0, unreceived: 0 } }));
    await page.route("**/api/v1/finance/payables**", (route) => reply(route, list([])));
    await page.route("**/api/v1/finance/receivables**", (route) => reply(route, list([])));
    await signInAsAdmin(page, "/dashboard/finance");
    await page.getByRole("link", { name: "应收", exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/finance\/receivable$/);
    await page.getByRole("link", { name: "应付", exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/finance\/payable$/);
  });
});
