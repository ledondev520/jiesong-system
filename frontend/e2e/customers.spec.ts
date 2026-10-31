/**
 * Input: 客户与门店页面、按测试隔离的合成 /customers 与 /stores 接口
 * Output: 列表 → 详情 → 新增门店（带 customerId、简称大写）的桌面/手机验收，以及侧栏入口
 * Pos: 客户与门店验收；所有写入只发生在本测试的路由模拟里
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const port = { id: "port-la", name: "洛杉矶", code: "LA", isActive: true, createdAt: "", updatedAt: "" };
const base = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

const reply = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: status, message: "ok", data }) });

async function mockCustomers(page: Page) {
  const stores = [
    { id: "s1", name: "Sacramento 店", portId: port.id, port, code: "SAC", legalName: "Khp Sacramento LLC", isActive: true, customerId: "c1", ...base },
  ];
  const customer = () => ({
    id: "c1", name: "Seapot", legalName: "Seapot Group Inc", country: "US", defaultCurrency: "USD", defaultIncoterm: "FOB",
    defaultPaymentTerms: "30% 定金", defaultPortOfLoading: "Shanghai", isActive: true, ...base,
    _count: { stores: stores.length }, stores,
  });
  const created: unknown[] = [];
  await page.route("**/api/v1/customers**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/customers/c1")) return reply(route, customer());
    return reply(route, { items: [customer()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
  });
  await page.route("**/api/v1/stores/options/ports", (route) => reply(route, [port]));
  await page.route("**/api/v1/stores", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    created.push(body);
    stores.push({ id: "s2", isActive: true, port, ...body, ...base });
    return reply(route, stores[stores.length - 1], 201);
  });
  await page.route("**/api/v1/sales?**", (route) =>
    reply(route, { items: [{ id: "o1", contractNo: "EXP260100", status: "CONFIRMED", totalAmount: 1200 }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }),
  );
  return created;
}

for (const width of [390, 1440]) {
  test.describe(`customers ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await mockApiRoutes(page);
    });

    test("lists the customer and opens its detail with stores and orders", async ({ page }) => {
      await mockCustomers(page);
      await signInAsAdmin(page, "/dashboard/customers");
      await expect(page.getByRole("heading", { name: "客户与门店" })).toBeVisible();
      await page.getByRole("link", { name: "Seapot" }).first().click();
      await expect(page).toHaveURL(/\/dashboard\/customers\/c1$/);
      await expect(page.getByRole("heading", { name: "Seapot" })).toBeVisible();
      await expect(page.getByText("Sacramento 店").first()).toBeVisible();
      await expect(page.getByText("EXP260100").first()).toBeVisible();
    });
  });
}

test.describe("customers desktop store creation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("adds a store under the customer with an upper-case code and customerId", async ({ page }) => {
    await mockApiRoutes(page);
    const created = await mockCustomers(page);
    await signInAsAdmin(page, "/dashboard/customers/c1");
    await page.getByRole("button", { name: "新增门店" }).click();
    const dialog = page.getByRole("dialog", { name: "新增门店" });
    await dialog.getByLabel("门店名称 *").fill("Fremont 店");
    await dialog.getByLabel(/门店简称/).fill("fmt");
    await dialog.getByLabel("目的港 *").selectOption("port-la");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("Fremont 店").first()).toBeVisible();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: "Fremont 店", code: "FMT", portId: "port-la", customerId: "c1" });
  });

  test("shows 客户与门店 in the sidebar and rejects a bad store code before any request", async ({ page }) => {
    await mockApiRoutes(page);
    const created = await mockCustomers(page);
    await signInAsAdmin(page, "/dashboard/customers/c1");
    await expect(page.getByRole("link", { name: "客户与门店" }).first()).toBeVisible();
    await page.getByRole("button", { name: "新增门店" }).click();
    const dialog = page.getByRole("dialog", { name: "新增门店" });
    await dialog.getByLabel("门店名称 *").fill("坏简称店");
    await dialog.getByLabel(/门店简称/).fill("a");
    await dialog.getByLabel("目的港 *").selectOption("port-la");
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog.getByRole("alert")).toContainText("2–12");
    expect(created).toHaveLength(0);
  });
});
