/**
 * Input: 真实 Next 路由、1440/390px 视口与合成 API
 * Output: AI 停靠面板验收：主内容区变窄而不被遮挡、开合与 ?ai=1、旧 /dashboard/ai 重定向、手机全屏
 * Pos: AI 助手侧栏面板（Spec §10）回归；不发送任何 AI 请求
 */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

test.describe("AI 停靠面板", () => {
  test("桌面：打开后内容区变窄且与面板不重叠", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApiRoutes(page);
    await signInAsAdmin(page, "/dashboard/purchases");
    const main = page.locator("main");
    const before = (await main.boundingBox())!;

    await page.getByRole("button", { name: "AI 助手", exact: true }).click();
    const panel = page.getByTestId("ai-panel");
    await expect(panel).toBeVisible();
    const after = (await main.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;

    expect(after.width).toBeLessThan(before.width);
    expect(after.x + after.width).toBeLessThanOrEqual(panelBox.x + 1);

    await page.keyboard.press("Control+j");
    await expect(panel).toBeHidden();
    expect((await main.boundingBox())!.width).toBeCloseTo(before.width, 0);
  });

  test("旧 /dashboard/ai 重定向并打开面板，参数不留在地址栏", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApiRoutes(page);
    await signInAsAdmin(page, "/dashboard/ai");
    await expect(page.getByTestId("ai-panel")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("手机：点按后全屏打开，可关闭", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApiRoutes(page);
    await signInAsAdmin(page, "/dashboard");
    await expect(page.getByTestId("ai-panel-sheet")).toHaveCount(0);

    await page.getByRole("button", { name: "AI 助手", exact: true }).click();
    const sheet = page.getByTestId("ai-panel-sheet");
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);

    await sheet.getByRole("button", { name: "收起AI助手" }).click();
    await expect(sheet).toBeHidden();
  });
});
