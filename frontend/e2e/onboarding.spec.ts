/** Synthetic-only onboarding QA: no production account, OTP, or permission changes. */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin, mockUser } from "./helpers";

for (const width of [390, 1440]) {
  test(`管理员核对未开通账号，取消不生效，保存后列表刷新 ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApiRoutes(page);
    let pending = {
      ...mockUser,
      id: "pending",
      username: "pending@example.com",
      name: "合成待核对账号",
      role: "SALES",
      isActive: false,
    };
    let updates = 0;
    await page.route("**/api/v1/users**", async (route) => {
      const request = route.request();
      if (request.method() === "PUT") {
        updates++;
        const data = request.postDataJSON();
        expect(data).toMatchObject({ isActive: true, role: "SALES" });
        pending = { ...pending, ...data };
        await route.fulfill({ json: { code: 200, data: pending } });
      } else {
        await route.fulfill({
          json: {
            code: 200,
            data: {
              items: [mockUser, pending],
              pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
            },
          },
        });
      }
    });
    await signInAsAdmin(page, "/dashboard/users");
    await page
      .getByRole("button", { name: "未开通/已停用（1）", exact: true })
      .click();
    const openReview = () =>
      page
        .getByRole("button", {
          name: width < 768 ? "核对并开通" : "核对并开通 pending@example.com",
          exact: true,
        })
        .click();
    await openReview();
    await expect(
      page.getByRole("heading", { name: "核对并开通账号" }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "账号开通" }),
    ).not.toBeChecked();
    expect(updates).toBe(0);
    await page.getByRole("switch", { name: "账号开通" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(updates).toBe(0);
    await openReview();
    await expect(
      page.getByRole("switch", { name: "账号开通" }),
    ).not.toBeChecked();
    await page.getByRole("switch", { name: "账号开通" }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "未开通/已停用（0）", exact: true }),
    ).toBeVisible();
    expect(updates).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
