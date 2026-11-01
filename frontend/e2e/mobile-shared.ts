/**
 * Input: 手机视口宽度
 * Output: 共享路由清单、整页宽度检查与单视口三项验收注册函数
 * Pos: mobile-*.spec.ts 的共用模块（非 spec，不参与分片）
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Page } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

// 合成数据验收布局和交互；不向真实业务接口提交记录。
export const routes = [
  "/dashboard",
  "/dashboard/finance/analysis",
  "/dashboard/purchases",
  "/dashboard/purchases/new",
  "/dashboard/purchases/pc-001",
  "/dashboard/suppliers",
  "/dashboard/products",
  "/dashboard/inventory",
  "/dashboard/sales",
  "/dashboard/sales/create",
  "/dashboard/sales/sc-001",
  "/dashboard/customs",
  "/dashboard/customs?view=customs",
  "/dashboard/customs?view=refunds",
  "/dashboard/tax-refunds/create",
  "/dashboard/customs/new",
  "/dashboard/hs-codes",
  "/dashboard/finance",
  "/dashboard/finance/statements",
  "/dashboard/payments",
  "/dashboard/finance/receivable",
  "/dashboard/finance/payable",
  "/dashboard/finance/bank-flow",
  "/dashboard/finance/invoices",
  "/dashboard/finance/reconciliation",
  "/dashboard/settings",
  "/dashboard/settings/users",
  "/dashboard/settings/logs",
  "/dashboard/notifications",
  "/dashboard/settings/ai-usage",
  "/dashboard/settings/ai-access",
  "/dashboard/settings/ports",
  "/dashboard/settings/categories",
  "/dashboard/settings/customs-brokers",
  "/dashboard/settings/export",
  "/dashboard/settings/users",
  "/dashboard/logistics",
  "/dashboard/logistics/containers",
];

export async function expectFitsViewport(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  if (overflow > 1) {
    console.log("OVERFLOW", new URL(page.url()).pathname, overflow);
    await page.screenshot({
      path: test
        .info()
        .outputPath(new URL(page.url()).pathname.replaceAll("/", "-") + ".png"),
    });
  }
  expect.soft(overflow, page.url()).toBeLessThanOrEqual(1);
}

// 每个视口一个 spec 文件，使 Playwright 分片能把三个约 30s 的整页遍历分到不同 shard。
export function registerViewportSuite(width: number) {
  test.describe(`手机 ${width}px`, () => {
    test.use({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    test.beforeEach(async ({ page }) => {
      await mockApiRoutes(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
    });
    test("所有主页面内容与导航可达且不撑宽视口", async ({ page }) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.log("PAGE ERROR", error.message);
      });
      await signInAsAdmin(page);
      for (const route of routes) {
        await test.step(route, async () => {
          await page.goto(route);
          await expect(
            page.getByRole("navigation", { name: "主导航", exact: true }),
          ).toBeVisible();
          await expect(page.locator("main").first()).not.toBeEmpty();
          await expect(page.getByText("页面出现异常")).toHaveCount(0);
          await page.waitForLoadState("networkidle");
          if (route === "/dashboard/finance/statements") {
            await expect(
              page.getByTestId("financial-statements-drilldowns"),
            ).toBeVisible();
          }
          await expectFitsViewport(page);
          if (width === 390)
            await page.screenshot({
              path: test
                .info()
                .outputPath(
                  route.replaceAll("/", "-").replaceAll("?", "-") + ".png",
                ),
            });
        });
      }
      expect(errors).toEqual([]);
    });
    test("导航、搜索与商品长表单可触达", async ({ page }) => {
      await signInAsAdmin(page);
      await page.getByRole("button", { name: "更多", exact: true }).click();
      const sheet = page.getByRole("dialog");
      await expect(
        sheet.getByRole("button", { name: "设置", exact: true }),
      ).toBeVisible();
      await sheet.getByRole("button", { name: "设置", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/settings$/);
      await page.getByRole("button", { name: /搜索商品/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("dialog").getByRole("combobox").fill("不锈钢");
      await expect(page.getByRole("option").first()).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await page.goto("/dashboard/products");
      await page.getByRole("button", { name: "新增商品", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expectFitsViewport(page);
      const input = dialog.locator("input").first();
      expect(
        await input.evaluate((node) =>
          parseFloat(getComputedStyle(node).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
      const save = dialog
        .getByRole("button", { name: /保存|创建|确定/ })
        .last();
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await page.setViewportSize({ width: 844, height: 390 });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await expectFitsViewport(page);
      await page.setViewportSize({ width, height: 420 });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await expectFitsViewport(page);
    });

    test("财务明细加载后宽账簿在卡片内滚动", async ({ page }) => {
      await signInAsAdmin(page, "/dashboard/finance/statements?view=ledger");
      await expect(
        page.getByTestId("financial-statements-drilldowns"),
      ).toBeVisible();
      const ledger = page.locator("#finance-period-detail table").last();
      await expect(ledger).toBeVisible();
      const container = await ledger.evaluate((table) => {
        const scroller = table.parentElement!;
        const bounds = scroller.getBoundingClientRect();
        scroller.scrollLeft = scroller.scrollWidth;
        return {
          left: bounds.left,
          right: bounds.right,
          scrollLeft: scroller.scrollLeft,
        };
      });
      expect(container.left).toBeGreaterThanOrEqual(0);
      expect(container.right).toBeLessThanOrEqual(width);
      expect(container.scrollLeft).toBeGreaterThan(0);
      await expectFitsViewport(page);
    });
  });
}
