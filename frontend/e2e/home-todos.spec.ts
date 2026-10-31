/**
 * Input: 首页、合成只读待办 API（ADMIN）
 * Output: 待办卡片、总数与详情链接可见；首页无写入请求
 * Pos: 首页待办验收；各角色的内容裁剪由后端 dashboard-todos.integration.js 与 page.test.tsx 覆盖
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

for (const width of [390, 1440]) {
  test(`首页待办 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApiRoutes(page);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/") && request.method() !== "GET")
        writes.push(`${request.method()} ${request.url()}`);
    });
    await signInAsAdmin(page, "/dashboard");
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
    const todos = page.getByLabel("待办");
    await expect(todos.getByText("待付款")).toBeVisible();
    await expect(todos.getByText("待装柜")).toBeVisible();
    await expect(todos.getByText("¥600")).toBeVisible();
    await expect(todos.getByText("全部处理完毕")).toBeVisible();
    await expect(page.getByText("WPS 出货同步")).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
