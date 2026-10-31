/**
 * Input: 出口订单列表页、旧 /dashboard/sales 与 /dashboard/logistics/containers 重定向桩、共享合成接口
 * Output: 桌面/手机列表渲染，旧地址保留查询参数地重定向，状态 chip 写入 URL
 * Pos: J17 出口订单列表验收；所有请求都是按测试隔离的路由模拟
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const order = (id: string, contractNo: string, status: string, totalAmount: number) => ({
  id, contractNo, status, totalAmount, receivedAmount: 0, exchangeRate: 7.2, totalBoxes: 0, grossWeight: 0, netWeight: 0, volume: 0,
  stores: ["Sacramento 店"], port: { id: "p1", name: "洛杉矶", code: "LA", isActive: true }, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
});

const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, message: "ok", data }) });

async function mockOrders(page: Page) {
  const requests: URL[] = [];
  await page.route("**/api/v1/sales?**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const status = url.searchParams.get("status");
    const all = [order("o1", "EXP260101", "CONFIRMED", 1995), order("o2", "EXP260102", "SHIPPED", 4000)];
    const items = status ? all.filter((o) => o.status === status) : all;
    return reply(route, { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } });
  });
  return requests;
}

for (const width of [390, 1440]) {
  test.describe(`orders list ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await mockApiRoutes(page);
    });

    test("renders the orders and links each order number to its detail", async ({ page }) => {
      await mockOrders(page);
      await signInAsAdmin(page, "/dashboard/orders");
      await expect(page.getByRole("heading", { name: "出口订单" })).toBeVisible();
      await expect(page.getByText("EXP260101").first()).toBeVisible();
      await expect(page.getByText("EXP260102").first()).toBeVisible();
      await expect(page.getByRole("link", { name: "EXP260101" }).first()).toHaveAttribute("href", "/dashboard/sales/o1");
    });

    test("old /dashboard/sales URL redirects and keeps filters (keyword → q)", async ({ page }) => {
      const requests = await mockOrders(page);
      await signInAsAdmin(page, "/dashboard/sales?keyword=EXP26&status=SHIPPED");
      await expect(page).toHaveURL(/\/dashboard\/orders\?q=EXP26&status=SHIPPED$/);
      await expect(page.getByText("EXP260102").first()).toBeVisible();
      await expect(page.getByText("EXP260101")).toHaveCount(0);
      expect(requests.some((url) => url.searchParams.get("keyword") === "EXP26" && url.searchParams.get("status") === "SHIPPED")).toBe(true);
    });

    test("old container list URL lands on the orders list", async ({ page }) => {
      await mockOrders(page);
      await signInAsAdmin(page, "/dashboard/logistics/containers");
      await expect(page).toHaveURL(/\/dashboard\/orders$/);
    });
  });
}

test.describe("orders list desktop filters", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("a status chip filters the list and is stored in the URL", async ({ page }) => {
    await mockApiRoutes(page);
    await mockOrders(page);
    await signInAsAdmin(page, "/dashboard/orders");
    await page.getByRole("button", { name: "已发运" }).click();
    await expect(page).toHaveURL(/status=SHIPPED/);
    await expect(page.getByText("EXP260101")).toHaveCount(0);
    await expect(page.getByText("EXP260102").first()).toBeVisible();
  });
});
