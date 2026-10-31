/**
 * Input: 390/1440px browser, product detail page, synthetic product and bySupplier API responses
 * Output: 「采购价格」页签只读比价（最低价标注、税率说明）浏览器验收
 * Pos: Supplier price comparison acceptance; no production requests or real business data
 * Note: Update this header and the directory README when changing this file.
 */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const summary = (id: string, name: string, lastPrice: number) => ({
  supplierId: id,
  supplierName: name,
  hasQualityIssue: false,
  lastPrice,
  lastDate: "2026-09-01T00:00:00.000Z",
  lastContractNo: `CG-${id}`,
  lastTaxRate: 13,
  minPrice: lastPrice,
  averagePrice: lastPrice,
  count: 2,
});

for (const width of [390, 1440]) {
  test(`product purchase-price tab compares suppliers read-only ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await mockApiRoutes(page);
    await page.route("**/api/v1/products/qa-product-1", (route) =>
      route.fulfill({
        json: {
          code: 200,
          data: {
            id: "qa-product-1",
            customsName: "合成比价商品",
            isActive: true,
            createdAt: "2026-10-05T00:00:00Z",
            updatedAt: "2026-10-05T00:00:00Z",
          },
        },
      }),
    );
    await page.route(
      "**/api/v1/purchases/price-history/qa-product-1",
      (route) =>
        route.fulfill({
          json: {
            code: 200,
            data: {
              count: 2,
              averagePrice: 9,
              minPrice: 8,
              maxPrice: 10,
              history: [],
              bySupplier: [
                summary("qa-s1", "合成供应商甲", 8),
                summary("qa-s2", "合成供应商乙", 10),
              ],
            },
          },
        }),
    );
    await signInAsAdmin(page, "/dashboard/products/qa-product-1");
    await expect(
      page.getByRole("heading", { name: "合成比价商品" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "采购价格" }).click();
    await expect(page.getByText("合成供应商甲")).toBeVisible();
    await expect(page.getByText("合成供应商乙")).toBeVisible();
    await expect(page.getByText("最低", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/13% 增值税发票/)).toBeVisible();
    await expect(page.getByText("用此供应商")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}
