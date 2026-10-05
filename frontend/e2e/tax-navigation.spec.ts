/**
 * Input: 真实 Next 路由、390/1440px 视口与本地合成报关/退税 API
 * Output: 历史筛选、详情返回与退税页签切换的浏览器验收
 * Pos: 报关列表导航回归；不访问生产数据、不执行业务写入
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

for (const width of [390, 1440]) {
  test(`报关历史筛选、详情返回后退税页签切换 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApiRoutes(page);
    const declaration = {
      id: "qa-customs-navigation",
      declarationNo: "QA-CUSTOMS-NAVIGATION",
      status: "DRAFT",
      currency: "USD",
      totalAmount: 0,
      items: [],
    };
    const reads: Array<{
      page: string | null;
      keyword: string | null;
      status: string | null;
    }> = [];
    const businessWrites: string[] = [];
    await page.route("**/api/v1/customs-declarations**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") {
        businessWrites.push(request.method() + " " + url.pathname);
        await route.abort();
        return;
      }
      if (url.pathname === "/api/v1/customs-declarations") {
        const params = url.searchParams;
        reads.push({
          page: params.get("page"),
          keyword: params.get("keyword"),
          status: params.get("status"),
        });
        await route.fulfill({
          json: {
            code: 200,
            data: {
              items: [declaration],
              pagination: {
                total: 37,
                page: Number(params.get("page") || 1),
                pageSize: 20,
                totalPages: 2,
              },
            },
          },
        });
        return;
      }
      expect(url.pathname).toBe(
        "/api/v1/customs-declarations/qa-customs-navigation",
      );
      await route.fulfill({ json: { code: 200, data: declaration } });
    });
    await page.route("**/api/v1/tax-refunds**", async (route) => {
      const request = route.request();
      if (request.method() !== "GET") {
        businessWrites.push(
          request.method() + " " + new URL(request.url()).pathname,
        );
        await route.abort();
        return;
      }
      await route.fallback();
    });
    const oldUrl =
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=OLD&status=RELEASED";
    const newUrl =
      "/dashboard/tax-refunds?view=customs&source=qa&keyword=NEW&status=DRAFT";
    await signInAsAdmin(page, oldUrl);
    const search = page.getByPlaceholder("搜索报关单号或报关行...");
    const customsTab = page.getByRole("tab", { name: "报关单", exact: true });
    const refundsTab = page.getByRole("tab", { name: "退税记录", exact: true });
    await expect(search).toHaveValue("OLD");
    await expect(customsTab).toHaveAttribute("aria-selected", "true");
    await page.evaluate(
      (href) => window.history.pushState({}, "", href),
      newUrl,
    );
    await expect(search).toHaveValue("NEW");
    await expect(
      page.getByRole("button", { name: "下一页", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect
      .poll(() => reads.at(-1))
      .toEqual({ page: "2", keyword: "NEW", status: "DRAFT" });
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
    );
    await expect(search).toHaveValue("OLD");
    // 30 秒应用缓存可命中历史查询；验收页面恢复，不强制重复发送 API 请求。
    await expect(page.getByRole("combobox").first()).toHaveText("已放行");
    await expect(
      page.getByText("共 37 条，第 1 页；本页已放行 0 条", { exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect(search).toHaveValue("NEW");
    await expect(page.getByRole("combobox").first()).toHaveText("草稿");
    await expect(
      page.getByText("共 37 条，第 1 页；本页已放行 0 条", { exact: true }),
    ).toBeVisible();
    await expect(customsTab).toHaveAttribute("aria-selected", "true");

    await search.fill("TEST");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("keyword"))
      .toBe("TEST");
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "已放行", exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("status"))
      .toBe("RELEASED");
    expect(new URL(page.url()).searchParams.get("view")).toBe("customs");
    expect(new URL(page.url()).searchParams.get("source")).toBe("qa");
    await page.getByTestId("reset-filters").click();
    await expect(page).toHaveURL(
      /\/dashboard\/tax-refunds\?view=customs&source=qa$/,
    );
    await expect(search).toHaveValue("");
    await expect(page.getByRole("combobox").first()).toHaveText("全部状态");

    const detailName =
      width < 768 ? "查看详情" : `查看详情 ${declaration.declarationNo}`;
    await page.getByRole("button", { name: detailName, exact: true }).click();
    await expect(page).toHaveURL(
      /\/dashboard\/customs-declarations\/qa-customs-navigation$/,
    );
    await page.getByRole("button", { name: "返回", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "报关单管理", exact: true }),
    ).toBeVisible();
    // 不等待最后一次搜索 URL 提交，紧接着切换页签以覆盖中断中的筛选工作。
    await search.fill("LATE");
    await refundsTab.click();
    await expect(page).toHaveURL(/\/dashboard\/tax-refunds\?view=refunds$/);
    await expect(refundsTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "报关单管理", exact: true }),
    ).not.toBeVisible();
    await refundsTab.click();
    await expect(page).toHaveURL(/\/dashboard\/tax-refunds\?view=refunds$/);
    await page.getByRole("tab", { name: "退税工作台", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/tax-refunds$/);
    await page.keyboard.press("ArrowRight");
    await expect(customsTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(refundsTab).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/dashboard\/tax-refunds\?view=refunds$/);
    expect(businessWrites).toEqual([]);
  });
}
