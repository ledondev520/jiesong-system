/**
 * Input: 390/1440px 浏览器、商品编辑 UI、完全合成的 API 和延迟响应
 * Output: 取消/重开、迟到 HS 详情、保存失败重试和旧保存隔离的浏览器验收
 * Pos: 商品档案编辑生命周期验收，不访问真实业务或付费匹配服务
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const originalProduct = {
  id: "qa-editor-product",
  customsName: "QA-20261005 合成商品",
  specification: "合成测试规格",
  hsCode: "11111111",
  unit: "件",
  grossWeight: 2,
  isActive: true,
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
};

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

for (const width of [390, 1440]) {
  test(`商品关闭、Escape、历史返回和迟到匹配不恢复取消内容 ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await mockApiRoutes(page);
    let writes = 0;
    await page.route("**/api/v1/products**", async (route) => {
      if (route.request().method() !== "GET") writes += 1;
      await route.fulfill({
        json: {
          code: 200,
          data: { items: [originalProduct], pagination: { total: 1 } },
        },
      });
    });
    const hsDetail = gate();
    let detailsRequested = 0;
    let detailsFinished = 0;
    const suggestion = {
      id: "qa-hs",
      hsCode: "69072190",
      productName: "合成瓷砖",
      taxRate: 13,
      unit: "平方米",
    };
    await page.route("**/api/v1/hs-codes/**", async (route) => {
      const isSearch = new URL(route.request().url()).pathname.endsWith(
        "/search",
      );
      if (!isSearch) {
        detailsRequested += 1;
        await hsDetail.promise;
      }
      await route.fulfill({
        json: { code: 200, data: isSearch ? [suggestion] : suggestion },
      });
      if (!isSearch) detailsFinished += 1;
    });
    await signInAsAdmin(page, "/dashboard/products");
    const edit = () =>
      page.getByRole("button", { name: "编辑", exact: true }).first().click();
    const dialog = page.getByRole("dialog");

    for (const dismiss of ["close", "escape"]) {
      await edit();
      await dialog
        .getByLabel("规格", { exact: true })
        .fill("QA未保存规格取消验证");
      await dialog.getByLabel("毛重 (kg/箱)").fill("99");
      if (dismiss === "close")
        await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await edit();
      await expect(dialog.getByLabel("规格", { exact: true })).toHaveValue(
        "合成测试规格",
      );
      await expect(dialog.getByLabel("毛重 (kg/箱)")).toHaveValue("2");
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    }

    await edit();
    await dialog.getByRole("button", { name: /合成瓷砖.*69072190/ }).click();
    await expect.poll(() => detailsRequested).toBe(1);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await edit();
    hsDetail.release();
    await expect.poll(() => detailsFinished).toBe(1);
    await expect(dialog.getByLabel("HS编码")).toHaveValue("11111111");
    await expect(dialog.getByLabel("单位", { exact: true })).toHaveValue("件");
    await expect(dialog.getByText("已匹配 HSCode 69072190")).not.toBeVisible();
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByRole("button", { name: "新增商品", exact: true }).click();
    await dialog.getByLabel("报关名称 *").fill("合成未保存商品");
    await dialog.getByLabel("规格", { exact: true }).fill("合成未保存规格");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "新增商品", exact: true }).click();
    await expect(dialog.getByLabel("报关名称 *")).toHaveValue("");
    await expect(dialog.getByLabel("规格", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();

    await page.goto("/dashboard/suppliers");
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/products$/);
    await expect(dialog).not.toBeVisible();
    await edit();
    await expect(dialog.getByLabel("规格", { exact: true })).toHaveValue(
      "合成测试规格",
    );
    expect(writes).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test(`商品保存失败保留输入、重复提交拦截、旧保存隔离新草稿 ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApiRoutes(page);
    await page.route("**/api/v1/hs-codes/**", (route) =>
      route.fulfill({ json: { code: 200, data: [] } }),
    );
    const product: Record<string, unknown> = { ...originalProduct };
    const products = [product];
    const attempts: {
      method: string;
      path: string;
      body: Record<string, unknown>;
    }[] = [];
    const failures = { PUT: gate(), POST: gate() };
    const lateSave = gate();
    let delayNextSave = false;
    let reads = 0;
    let lastKeyword: string | null = null;
    let completedWrites = 0;
    await page.route("**/api/v1/products**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      if (method === "GET") {
        reads += 1;
        lastKeyword = url.searchParams.get("keyword");
        await route.fulfill({
          json: {
            code: 200,
            data: { items: products, pagination: { total: products.length } },
          },
        });
        return;
      }
      expect(["PUT", "POST"]).toContain(method);
      const body = request.postDataJSON();
      attempts.push({ method, path: url.pathname, body });
      const attemptNumber = attempts.filter(
        (attempt) => attempt.method === method,
      ).length;
      if (attemptNumber === 1) {
        await failures[method as "PUT" | "POST"].promise;
        await route.fulfill({
          status: 503,
          json: { code: 503, message: "合成保存故障" },
        });
        completedWrites += 1;
        return;
      }
      if (delayNextSave) await lateSave.promise;
      const saved =
        method === "PUT"
          ? Object.assign(product, body)
          : { ...body, id: "qa-created-product" };
      if (method === "POST") products.push(saved);
      await route.fulfill({ json: { code: 200, data: saved } });
      completedWrites += 1;
    });
    await signInAsAdmin(page, "/dashboard/products");
    const dialog = page.getByRole("dialog");
    const edit = () =>
      page.getByRole("button", { name: "编辑", exact: true }).first().click();

    for (const method of ["PUT", "POST"] as const) {
      if (method === "PUT") await edit();
      else
        await page
          .getByRole("button", { name: "新增商品", exact: true })
          .click();
      await dialog.getByLabel("报关名称 *").fill("合成重试商品");
      await dialog.getByLabel("规格", { exact: true }).fill("失败后保留规格");
      await dialog.getByLabel("毛重 (kg/箱)").fill("7");
      const beforeAttempts = attempts.length;
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await expect.poll(() => attempts.length).toBe(beforeAttempts + 1);
      await dialog.locator("form").dispatchEvent("submit");
      await expect(
        dialog.getByRole("button", { name: "保存中..." }),
      ).toBeDisabled();
      expect(attempts).toHaveLength(beforeAttempts + 1);
      failures[method].release();
      await expect(dialog.getByRole("alert")).toHaveText(
        "保存失败，请稍后重试",
      );
      await expect(dialog.getByLabel("报关名称 *")).toHaveValue("合成重试商品");
      await expect(dialog.getByLabel("规格", { exact: true })).toHaveValue(
        "失败后保留规格",
      );
      await expect(dialog.getByLabel("毛重 (kg/箱)")).toHaveValue("7");
      const beforeReads = reads;
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect.poll(() => reads).toBeGreaterThan(beforeReads);
      expect(attempts[beforeAttempts + 1]).toEqual(attempts[beforeAttempts]);
    }

    delayNextSave = true;
    await edit();
    await dialog.getByLabel("规格", { exact: true }).fill("原会话已提交规格");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => attempts.length).toBe(5);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByPlaceholder("搜索商品...").fill("当前筛选");
    await expect.poll(() => lastKeyword).toBe("当前筛选");
    await page.getByRole("button", { name: "新增商品", exact: true }).click();
    await dialog.getByLabel("报关名称 *").fill("另一个新草稿");
    await dialog.getByLabel("规格", { exact: true }).fill("不应被旧保存清空");
    const beforeReads = reads;
    lateSave.release();
    await expect.poll(() => completedWrites).toBe(5);
    await expect.poll(() => reads).toBeGreaterThan(beforeReads);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("规格", { exact: true })).toHaveValue(
      "不应被旧保存清空",
    );
    expect(lastKeyword).toBe("当前筛选");
    expect(attempts).toHaveLength(5);
  });
}
