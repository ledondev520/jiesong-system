/**
 * Input: Settings layout, shared synthetic API routes, retired page URLs
 * Output: Desktop settings sections and old-URL redirect regressions
 * Pos: Settings IA acceptance (users merged, logs/AI pages moved); read-only, no writes
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

test.describe("settings sections", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  test("the settings nav lists the section links", async ({ page }) => {
    await signInAsAdmin(page, "/dashboard/settings");
    const nav = page.locator("aside");
    for (const [name, href] of [
      ["报价规则", "/dashboard/settings"],
      ["用户", "/dashboard/settings/users"],
      ["公司信息", "/dashboard/settings/company"],
      ["AI 接入", "/dashboard/settings/ai-access"],
      ["AI 用量", "/dashboard/settings/ai-usage"],
      ["系统日志", "/dashboard/settings/logs"],
    ]) {
      await expect(nav.getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  for (const [oldPath, newPath] of [
    ["/dashboard/users", "/dashboard/settings/users"],
    ["/dashboard/system/logs", "/dashboard/settings/logs"],
    ["/dashboard/system/notifications", "/dashboard/notifications"],
    ["/dashboard/about", "/dashboard/settings/ai-access"],
    ["/dashboard/ai/sessions", "/dashboard/settings/ai-usage"],
  ]) {
    test(`${oldPath} redirects to ${newPath}`, async ({ page }) => {
      await signInAsAdmin(page, oldPath);
      await expect(page).toHaveURL(new RegExp(`${newPath}$`));
    });
  }
});
