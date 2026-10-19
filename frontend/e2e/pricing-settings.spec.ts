/**
 * Input: Settings page, shared synthetic pricing API and malformed response overrides
 * Output: Desktop/mobile load, save/reload and malformed-response isolation regressions
 * Pos: Pricing settings acceptance; all writes remain in the per-test route mock
 * Note: Update this header and the directory README when changing this file.
 */
import { expect, test } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";
import defaults from "../../config/pricing.json";

const pricingUrl = "**/api/v1/system/pricing-config";
const malformedLoads = [
  {
    name: "pagination fallback",
    data: { items: [], pagination: { total: 0 } },
  },
  { name: "null data", data: null },
  {
    name: "missing schema",
    data: { config: defaults, revision: "a".repeat(64) },
  },
];

for (const width of [390, 1440]) {
  test.describe(`pricing settings ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await mockApiRoutes(page);
    });

    test("loads, saves and reloads the versioned configuration", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await signInAsAdmin(page, "/dashboard/settings");
      await expect(
        page.getByRole("heading", { name: "系统配置" }),
      ).toBeVisible();
      await expect(page.getByLabel("乘数", { exact: true })).toHaveValue("1.3");
      await page.getByLabel("乘数", { exact: true }).fill("1.5");
      const saved = page.waitForRequest(
        (request) =>
          request.url().endsWith("/system/pricing-config") &&
          request.method() === "PUT",
      );
      await page
        .getByRole("button", { name: "保存报价配置", exact: true })
        .click();
      const payload = (await saved).postDataJSON();
      expect(payload.config).toEqual({ ...defaults, multiplier: 1.5 });
      expect(payload.revision).toMatch(/^[a-f0-9]{64}$/);
      await expect(
        page.getByText("报价配置已保存", { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("乘数", { exact: true })).toHaveValue("1.5");
      await expect(
        page.getByRole("heading", { name: "页面出现异常" }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    for (const malformed of malformedLoads) {
      test(`isolates ${malformed.name} without losing the settings shell`, async ({
        page,
      }) => {
        const errors: string[] = [];
        const writes: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
          if (request.method() === "PUT") writes.push(request.url());
        });
        await page.route(pricingUrl, (route) =>
          route.fulfill({ json: { code: 200, data: malformed.data } }),
        );
        await signInAsAdmin(page, "/dashboard/settings");
        await expect(page.getByRole("alert")).toHaveText(
          "报价配置加载失败，请刷新页面重试",
        );
        await expect(
          page.getByRole("heading", { name: "系统配置" }),
        ).toBeVisible();
        await expect(
          page.getByRole("navigation", { name: "主导航", exact: true }),
        ).toBeVisible();
        await expect(page.getByLabel("乘数", { exact: true })).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "保存报价配置", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "页面出现异常" }),
        ).toHaveCount(0);
        expect(writes).toEqual([]);
        expect(errors).toEqual([]);
      });
    }

    test("invalid save response preserves the draft for an explicit retry", async ({
      page,
    }) => {
      const errors: string[] = [];
      const writes: unknown[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(pricingUrl, async (route) => {
        if (route.request().method() !== "PUT") {
          await route.fallback();
          return;
        }
        writes.push(route.request().postDataJSON());
        if (writes.length === 1) {
          await route.fulfill({ json: { code: 200, data: { items: [] } } });
        } else {
          await route.fallback();
        }
      });
      await signInAsAdmin(page, "/dashboard/settings");
      await page.getByLabel("乘数", { exact: true }).fill("1.5");
      await page
        .getByRole("button", { name: "保存报价配置", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        "报价配置响应无效，请重新加载后重试",
      );
      await expect(page.getByLabel("乘数", { exact: true })).toHaveValue("1.5");
      await expect(
        page.getByText("报价配置已保存", { exact: true }),
      ).toHaveCount(0);
      expect(writes).toHaveLength(1);
      await page
        .getByRole("button", { name: "保存报价配置", exact: true })
        .click();
      await expect(
        page.getByText("报价配置已保存", { exact: true }),
      ).toBeVisible();
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
      await page.reload();
      await expect(page.getByLabel("乘数", { exact: true })).toHaveValue("1.5");
      await expect(
        page.getByRole("heading", { name: "页面出现异常" }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
