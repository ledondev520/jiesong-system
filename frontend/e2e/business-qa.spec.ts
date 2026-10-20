/** Synthetic purchase search regression; no production data or business writes. */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

for (const width of [390, 1440]) {
  test(`采购合同编号搜索与具名详情入口 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApiRoutes(page);
    const contract = {
      id: "qa-purchase",
      contractNo: "SYNTHETIC-QA-42",
      status: "SIGNED",
      totalAmount: 100,
      paidAmount: 0,
      supplier: { name: "合成供应商" },
      items: [{ id: "qa-item", product: { customsName: "合成商品" } }],
    };
    await page.route("**/api/v1/purchases?**", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      const keyword = params.get("keyword");
      const items =
        !params.has("productKeyword") &&
        (!keyword || contract.contractNo.includes(keyword))
          ? [contract]
          : [];
      await route.fulfill({
        json: {
          code: 200,
          data: {
            items,
            pagination: {
              page: 1,
              pageSize: 20,
              total: items.length,
              totalPages: 1,
            },
            summary: { statusCounts: { SIGNED: 1 }, stores: [] },
          },
        },
      });
    });
    await signInAsAdmin(page, "/dashboard/contracts");
    if (width < 768)
      await page.getByRole("button", { name: "筛选与搜索" }).click();
    const search = page.getByRole("textbox", {
      name: "搜索合同号、供应商或商品",
    });
    const request = page.waitForRequest(
      (req) =>
        new URL(req.url()).pathname === "/api/v1/purchases" &&
        new URL(req.url()).searchParams.get("keyword") === contract.contractNo,
    );
    await search.fill(contract.contractNo);
    expect(
      new URL((await request).url()).searchParams.has("productKeyword"),
    ).toBe(false);
    if (width < 768) await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", {
        name: `查看 ${contract.contractNo} 详情`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `为 ${contract.contractNo} 生成购销合同`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
