/**
 * Input: 合成 API 夹具与手机、平板、桌面视口（320/390/430 三个手机视口遍历在 mobile-<宽度>.spec.ts）
 * Output: 页面可达、设置菜单精确命名与收起、账簿滚动及核心交互验收
 * Pos: Playwright 移动端回归，保持运行时异常与整页宽度检查
 */
import { expect, test } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";
import { expectFitsViewport } from "./mobile-shared";

test.describe("手机核心操作", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  test("登录、公共页面与退出", async ({ page }) => {
    for (const route of ["/login", "/register", "/forgot-password"]) {
      await page.goto(route);
      await expect(page.locator("form")).toBeVisible();
      if (route === "/register") {
        await expect(page.getByText("邮箱注册", { exact: true })).toBeVisible();
        await page
          .getByLabel("邮箱", { exact: true })
          .fill("mobile@example.com");
        const sent = page.waitForRequest(
          (request) =>
            new URL(request.url()).pathname === "/api/v1/auth/email-code" &&
            request.method() === "POST",
        );
        await page
          .getByRole("button", { name: "获取验证码", exact: true })
          .click();
        expect((await sent).postDataJSON()).toEqual({
          email: "mobile@example.com",
        });
        await expect(page.getByRole("status")).toContainText("验证码已发送");
        await expect(
          page.getByRole("button", { name: /秒后重发/ }),
        ).toBeDisabled();
        await page.getByLabel("邮箱验证码", { exact: true }).fill("123456");
        await page.getByLabel("姓名", { exact: true }).fill("合成手机测试");
        await page
          .getByLabel("密码", { exact: true })
          .fill("non-production-preview");
        const submitted = page.waitForRequest(
          (request) =>
            new URL(request.url()).pathname === "/api/v1/auth/email-register" &&
            request.method() === "POST",
        );
        await page
          .getByRole("button", { name: "注册并申请开通", exact: true })
          .click();
        expect((await submitted).postDataJSON()).toMatchObject({
          email: "mobile@example.com",
          code: "123456",
          name: "合成手机测试",
        });
        await expect(
          page.getByText("注册申请已提交", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(
            "邮箱验证和账号申请已完成，请按下面步骤联系管理员开通。",
          ),
        ).toBeVisible();
        expect(
          await page.evaluate(() =>
            sessionStorage.getItem("jiesong_access_token"),
          ),
        ).toBeNull();
        await page.reload();
        await expect(
          page.getByRole("region", { name: "注册申请回执" }),
        ).toContainText("不是实时审核结果");
        await expectFitsViewport(page);
      }
      await expectFitsViewport(page);
    }
    await page.goto("/login");
    await page.getByRole("textbox").first().fill("mobile-demo");
    await page.locator('input[type="password"]').fill("non-production-preview");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "工作台", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "更多", exact: true }).click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("出口两步表单、日期选择、必填校验与装箱编辑", async ({ page }) => {
    await signInAsAdmin(page, "/dashboard/sales/create");
    await page.getByRole("button", { name: "签订日期", exact: true }).click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
    await expectFitsViewport(page);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "下一步：出口明细", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "创建合同", exact: true }),
    ).toBeVisible();
    await expectFitsViewport(page);
    await page.getByRole("button", { name: "创建合同", exact: true }).click();
    await expect(
      page.getByText("请选择商品", { exact: true }).last(),
    ).toBeVisible();
    await page.goto("/dashboard/sales/sc-001?tab=container");
    await page
      .getByRole("button", { name: "编辑 不锈钢门", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "保存", exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "保存", exact: true })
      .scrollIntoViewIfNeeded();
    await expectFitsViewport(page);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    for (const name of ["明细", "单证", "收款", "货柜"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expectFitsViewport(page);
    }
  });

  test("采购供应商选择与手机档案定位", async ({ page }) => {
    await signInAsAdmin(page, "/dashboard/purchases/new");
    await page.getByRole("combobox", { name: "商品 *", exact: true }).click();
    await page.getByRole("option", { name: /不锈钢门/ }).click();
    await page
      .getByRole("spinbutton", { name: "数量 *", exact: true })
      .fill("2");
    await page
      .getByRole("spinbutton", { name: "单价 (¥) *", exact: true })
      .fill("100");
    await page
      .getByRole("button", { name: "下一步：合同信息", exact: true })
      .click();
    await page.getByRole("combobox", { name: "供应商 *", exact: true }).click();
    await page
      .getByRole("combobox", { name: "搜索供应商", exact: true })
      .fill("供应商A");
    await expectFitsViewport(page);
    await page.getByRole("option", { name: /供应商A/ }).click();
    await expect(
      page.getByRole("combobox", { name: "供应商 *", exact: true }),
    ).toContainText("供应商A");
    await page.goto("/dashboard/suppliers");
    await page.getByRole("button", { name: /供应商A/ }).click();
    await expect(
      page.getByRole("heading", { name: "供应商档案", exact: true }),
    ).toBeInViewport();
  });

  test("报关退税详情、编辑和手机卡片完整显示", async ({ page }) => {
    await signInAsAdmin(page);
    for (const route of [
      "/dashboard/customs/cd-1",
      "/dashboard/customs/cd-1/edit",
      "/dashboard/tax-refunds/tr-1",
      "/dashboard/tax-refunds/tr-1/edit",
    ]) {
      await page.goto(route);
      await expect(
        page.getByRole("navigation", { name: "主导航", exact: true }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("页面出现异常")).toHaveCount(0);
      await expectFitsViewport(page);
    }
  });
});

test.describe("平板与桌面保持可用", () => {
  for (const width of [768, 1440]) {
    test(`主要页面 ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockApiRoutes(page);
      await signInAsAdmin(page);
      for (const route of [
        "/dashboard",
        "/dashboard/purchases",
        "/dashboard/sales",
        "/dashboard/settings",
      ]) {
        await page.goto(route);
        await expect(page.locator("main").first()).not.toBeEmpty();
        await page.waitForLoadState("networkidle");
        await expectFitsViewport(page);
      }
    });
  }
});

test.describe("手机查阅与异常恢复", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });
  test("设置子菜单完整可达并自动收起", async ({ page }) => {
    await signInAsAdmin(page, "/dashboard/settings");
    // 设置页还有「高级」折叠区的 details；收起时菜单里的链接不在可访问树里，所以按 summary 文案取设置导航菜单
    const menu = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "设置菜单" }) });
    for (const [label, path] of [
      ["港口", "ports"],
      ["商品分类", "categories"],
      ["报关行", "customs-brokers"],
      ["数据导入导出", "export"],
    ]) {
      await menu.locator("summary").click();
      await expect(menu).toHaveAttribute("open");
      const link = menu.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/dashboard/settings/${path}`);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/settings/${path}$`));
      await expect(menu).not.toHaveAttribute("open");
      await expectFitsViewport(page);
    }
  });
  test("HS 详情内容、夜间模式与返回", async ({ page }) => {
    await signInAsAdmin(page, "/dashboard/hs-codes");
    await page.getByPlaceholder("编码前缀（4–12位）").fill("7308");
    await page
      .getByRole("button", { name: "查看申报要素与详情", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "返回列表", exact: true }),
    ).toBeVisible();
    await expectFitsViewport(page);
    await page.getByRole("button", { name: "返回列表", exact: true }).click();
    await page
      .getByRole("button", { name: "切换到夜间模式", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectFitsViewport(page);
    await page.screenshot({ path: test.info().outputPath("hs-dark.png") });
  });
  test("列表接口失败后能刷新恢复", async ({ page }) => {
    await page.route("**/api/v1/products?**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: 503, message: "验收：暂时不可用" }),
      }),
    );
    await signInAsAdmin(page, "/dashboard/products");
    await expect(page.getByText("加载商品失败").first()).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "主导航", exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/v1/products?**");
    await page.reload();
    await expect(
      page.getByText("不锈钢门", { exact: true }).first(),
    ).toBeVisible();
    await expectFitsViewport(page);
  });
});
