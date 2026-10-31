/**
 * Input: quote list/detail pages with a per-test mocked /quotes API (all writes stay in the route mock)
 * Output: list → detail → 转为出口订单 sends exactly {status:"CONVERTED"} and lands on the new order; draft/SENT buttons by status
 * Pos: quote → order acceptance (J22). The backend conversion transaction is covered by quote-lifecycle.integration.js.
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const item = {
  id: "i1", productId: "p1", storeId: "s1", quantity: 10, unit: "PCS", costCny: 10000, formulaPrice: 1994,
  unitPrice: 1994, isManualPrice: false, totalPrice: 19940, markup: 0.3, note: null, specification: null,
  product: { id: "p1", customsName: "合成商品" }, store: { id: "s1", name: "合成门店", code: "SAC" },
};
const quote = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "q1", quoteNo: "QT2610-001", status, currency: "USD", incoterm: "FOB", portOfLoading: "Shanghai",
  paymentTerms: null, validUntil: null, spotRate: 6.72, pricingRate: 6.52, totalAmount: 19940, note: null,
  customerId: "c1", customer: { id: "c1", name: "合成客户" }, createdAt: "2026-10-31T01:00:00.000Z",
  isExpired: false, _count: { items: 1 }, items: [item], ...extra,
});
const envelope = (data: unknown) => ({ code: 200, message: "ok", data });

test("quote → order: accepted quote converts and opens the new order", async ({ page }) => {
  await mockApiRoutes(page);
  let current = quote("ACCEPTED");
  const puts: unknown[] = [];
  await page.route("**/api/v1/quotes**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === "PUT" && pathname.endsWith("/quotes/q1")) {
      const body = request.postDataJSON();
      puts.push(body);
      current = quote("CONVERTED", { salesContract: { id: "ord-1", contractNo: "EXP202600001" } });
      return route.fulfill({ json: envelope({ ...current, convertedOrder: { id: "ord-1", contractNo: "EXP202600001" } }) });
    }
    if (pathname.endsWith("/quotes/q1")) return route.fulfill({ json: envelope(current) });
    return route.fulfill({ json: envelope({ items: [current], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }) });
  });

  await signInAsAdmin(page, "/dashboard/quotes");
  await expect(page.getByRole("tab", { name: "报价" }).or(page.getByRole("link", { name: "报价" })).first()).toBeVisible();
  await page.getByTestId("quote-row-QT2610-001").click();
  await expect(page).toHaveURL(/\/dashboard\/quotes\/q1$/);
  await expect(page.getByRole("button", { name: "转为出口订单" })).toBeVisible();
  await page.getByRole("button", { name: "转为出口订单" }).click();
  await expect(page).toHaveURL(/\/dashboard\/sales\/ord-1/);
  expect(puts).toEqual([{ status: "CONVERTED" }]);
});

test("quote detail shows one primary button per status", async ({ page }) => {
  await mockApiRoutes(page);
  let current = quote("SENT");
  await page.route("**/api/v1/quotes**", (route) => route.fulfill({ json: envelope(current) }));
  await signInAsAdmin(page, "/dashboard/quotes/q1");
  await expect(page.getByRole("button", { name: "客户已接受" })).toBeVisible();
  await expect(page.getByRole("button", { name: "转为出口订单" })).toHaveCount(0);
  current = quote("CONVERTED", { salesContract: { id: "ord-1", contractNo: "EXP202600001" } });
  await page.reload();
  await expect(page.getByRole("link", { name: "查看订单" })).toHaveAttribute("href", "/dashboard/sales/ord-1");
});
