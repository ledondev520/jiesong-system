/**
 * Input: 公开落地页 /、登录/注册入口、已登录会话
 * Output: 匿名访客看到落地页（不再被转去登录）；CTA 去 /login 与 /register；已登录会话进入 / 后转去 /dashboard；手机无横向滚动
 * Pos: 重设计 Phase 1b（B27）验收；页面内容与可访问性细节由 src/app/page.test.tsx 覆盖
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

test.describe("落地页", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  test("匿名访客停留在落地页，主 CTA 去登录，次 CTA 去注册", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "从报价到退税，出口业务一站走完",
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle("捷淞国际物流 · 进出口业务管理系统");

    await page
      .getByRole("main")
      .getByRole("link", { name: "登录系统" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("系统登录")).toBeVisible();

    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: "申请账号" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("已登录会话访问 / 会转去 dashboard", async ({ page }) => {
    await signInAsAdmin(page, "/");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  for (const width of [320, 390, 1440]) {
    test(`无横向滚动 ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
