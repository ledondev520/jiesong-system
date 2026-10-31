/**
 * Input: 订单编辑器 /dashboard/orders/new、合成 /customers /stores /products /pricing/preview /sales 接口
 * Output: 创建含两家门店的订单：Seapot 默认选中、条款预填、整数建议价、手动价标记、粘贴匹配、创建载荷
 * Pos: J18 验收；所有写入只发生在本测试的路由模拟里
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const port = { id: "port-la", name: "洛杉矶", code: "LA", isActive: true, createdAt: "", updatedAt: "" };
const base = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const stores = [
  { id: "s1", name: "Sacramento 店", code: "SAC", portId: port.id, port, isActive: true, customerId: "c1", ...base },
  { id: "s2", name: "Fremont 店", code: "FMT", portId: port.id, port, isActive: true, customerId: "c1", ...base },
];
const seapot = { id: "c1", name: "Seapot", defaultCurrency: "USD", defaultIncoterm: "FOB", defaultPaymentTerms: "30% 定金", defaultPortOfLoading: "Shanghai", isActive: true, ...base };
const door = { id: "p1", customsName: "不锈钢门", unit: "件", isActive: true, ...base };

const reply = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: status, message: "ok", data }) });
const page$ = (items: unknown[]) => ({ items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: 1 } });

async function mockEditor(page: Page) {
  const created: unknown[] = [];
  await page.route("**/api/v1/customers**", (route) => {
    const url = new URL(route.request().url());
    return reply(route, url.pathname.endsWith("/stores") ? page$(stores) : page$([seapot]));
  });
  await page.route("**/api/v1/products?**", (route) => reply(route, page$([door])));
  // Locked rule at spot 6.72 (FX used 6.52): ¥10,000 → 13,000 / 6.52 = 1993.87 → 1994.
  await page.route("**/api/v1/pricing/preview", (route) => {
    const { lines } = route.request().postDataJSON();
    const results = lines.map((line: { costCny: number }, index: number) => ({
      index, status: "OK", unitPriceUsd: line.costCny === 10000 ? 1994 : 20, markup: 0.3, effectiveRate: 6.52,
    }));
    return reply(route, { results, spotRate: 6.72 });
  });
  await page.route("**/api/v1/sales", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    created.push({ body: route.request().postDataJSON(), key: route.request().headers()["x-idempotency-key"] });
    return reply(route, { id: "o-new", contractNo: "EXP260999" }, 201);
  });
  return created;
}

test.describe("order editor", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("creates an order with two stores, integer prices and a manual override", async ({ page }) => {
    await mockApiRoutes(page);
    const created = await mockEditor(page);
    await signInAsAdmin(page, "/dashboard/orders/new");
    await expect(page.getByRole("heading", { name: "新建出口订单" })).toBeVisible();
    // Single active customer is preselected and its terms are prefilled.
    await expect(page.getByLabel("客户 *")).toHaveValue("c1");
    await expect(page.getByLabel("贸易术语")).toHaveValue("FOB");
    await expect(page.getByLabel("付款条件")).toHaveValue("30% 定金");
    await expect(page.getByLabel("装货港")).toHaveValue("Shanghai");

    // Line 1 → Sacramento, ¥10,000 → $1,995 (integer, multiple of 5).
    await page.getByLabel("第 1 行搜索商品").fill("不锈钢");
    await page.getByRole("option", { name: /不锈钢门/ }).click();
    await page.getByLabel("第 1 行门店").selectOption("s1");
    await page.getByLabel("第 1 行数量").fill("10");
    await page.getByLabel("第 1 行采购成本").fill("10000");
    await expect(page.getByLabel("第 1 行单价")).toHaveValue("1994");
    await expect(page.getByLabel("现汇 (¥/$) *")).toHaveValue("6.72");

    // Line 2 → Fremont with a manual price.
    await page.getByRole("button", { name: "添加一行" }).click();
    await page.getByLabel("第 2 行搜索商品").fill("不锈钢");
    await page.getByRole("option", { name: /不锈钢门/ }).click();
    await page.getByLabel("第 2 行门店").selectOption("s2");
    await page.getByLabel("第 2 行数量").fill("2");
    await page.getByLabel("第 2 行采购成本").fill("100");
    await page.getByLabel("第 2 行单价").fill("30");
    await expect(page.getByText("手动价")).toBeVisible();
    await expect(page.getByText("订单合计 $20,010.00")).toBeVisible();

    await page.getByRole("button", { name: "创建订单" }).click();
    await expect(page).toHaveURL(/\/dashboard\/sales\/o-new$/);
    expect(created).toHaveLength(1);
    const { body, key } = created[0] as { body: Record<string, unknown> & { items: Record<string, unknown>[] }; key: string };
    expect(key).toBeTruthy();
    expect(body).toMatchObject({ customerId: "c1", currency: "USD", incoterm: "FOB", exchangeRate: 6.72 });
    expect(body.items.map((item) => [item.storeId, item.quantity, item.costPrice, item.sellingPrice])).toEqual([
      ["s1", 10, 10000, 1994],
      ["s2", 2, 100, 30],
    ]);
  });

  test("blocks submit with a clear reason and sends nothing", async ({ page }) => {
    await mockApiRoutes(page);
    const created = await mockEditor(page);
    await signInAsAdmin(page, "/dashboard/orders/new");
    await page.getByRole("button", { name: "创建订单" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "现汇" })).toBeVisible(); // Next also renders a route-announcer alert
    expect(created).toHaveLength(0);
  });

  test("pasting rows matches products and stores and reports what it could not match", async ({ page }) => {
    await mockApiRoutes(page);
    await mockEditor(page);
    await signInAsAdmin(page, "/dashboard/orders/new");
    await page.getByRole("button", { name: "从 Excel 粘贴" }).click();
    await page.getByLabel("粘贴内容").fill("不锈钢门\tFMT\t5\t10000\n未知商品\tSAC\t1\t1");
    await page.getByRole("button", { name: "添加到订单" }).click();
    await expect(page.getByRole("alert")).toContainText("找不到商品「未知商品」");
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByLabel("第 1 行门店")).toHaveValue("s2");
    await expect(page.getByLabel("第 1 行数量")).toHaveValue("5");
    await expect(page.getByLabel("第 1 行单价")).toHaveValue("1994");
  });
});
