/**
 * Input: 390/1440px browser, real supplier editors, synthetic API responses and deferred writes
 * Output: Failed-save retry, cancel/reopen and late-result isolation browser regressions
 * Pos: Supplier editor lifecycle acceptance; no production requests or real business data
 * Note: Update this header and the directory README when changing this file.
 */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const suppliers = [
  {
    id: "qa-supplier-a",
    name: "合成供应商甲",
    contactName: "合成甲联系人",
    hasQualityIssue: false,
    aliases: [],
    isActive: true,
    createdAt: "2026-10-05T00:00:00Z",
    updatedAt: "2026-10-05T00:00:00Z",
  },
  {
    id: "qa-supplier-b",
    name: "合成供应商乙",
    contactName: "合成乙联系人",
    hasQualityIssue: false,
    aliases: [],
    isActive: true,
    createdAt: "2026-10-05T00:00:00Z",
    updatedAt: "2026-10-05T00:00:00Z",
  },
];
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const catalog = () => ({
  code: 200,
  data: {
    items: suppliers.map((supplier) => ({ ...supplier })),
    pagination: { total: 2, totalPages: 1 },
  },
});

for (const width of [390, 1440]) {
  test(`supplier homepage failure retry and late save preserve newer selection ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await mockApiRoutes(page);
    const late = gate();
    const writes: Record<string, unknown>[] = [];
    let completed = 0;
    await page.route("**/api/v1/suppliers**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: catalog() });
        return;
      }
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        await route.fulfill({
          status: 500,
          json: { code: 500, message: "合成保存失败", data: null },
        });
      } else {
        if (writes.length === 3) await late.promise;
        await route.fulfill({
          json: { code: 200, data: { ...suppliers[0], ...body } },
        });
      }
      completed += 1;
    });
    await signInAsAdmin(page, "/dashboard/suppliers");
    await page.getByRole("button", { name: "选择供应商 合成供应商甲" }).click();
    await page.getByLabel("联系人", { exact: true }).fill("合成失败重试草稿");
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(page.getByText("更新失败", { exact: true })).toBeVisible();
    await expect(page.getByLabel("联系人", { exact: true })).toHaveValue(
      "合成失败重试草稿",
    );
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect.poll(() => completed).toBe(2);
    await expect(
      page.getByRole("button", { name: "保存修改", exact: true }),
    ).toBeEnabled();
    expect(writes[1]).toEqual(writes[0]);
    await page.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect.poll(() => writes.length).toBe(3);
    await page.getByRole("button", { name: "选择供应商 合成供应商乙" }).click();
    await page.getByLabel("联系人", { exact: true }).fill("合成乙新草稿");
    await page
      .getByPlaceholder("搜索名称、联系人、别名...")
      .fill("合成供应商乙");
    late.release();
    await expect.poll(() => completed).toBe(3);
    await expect(
      page.getByRole("button", { name: "选择供应商 合成供应商乙" }),
    ).toBeVisible();
    await expect(page.getByLabel("公司名称 *")).toHaveValue("合成供应商乙");
    await expect(page.getByLabel("联系人", { exact: true })).toHaveValue(
      "合成乙新草稿",
    );
    await expect(
      page.getByPlaceholder("搜索名称、联系人、别名..."),
    ).toHaveValue("合成供应商乙");
    expect(pageErrors).toEqual([]);
  });

  test(`purchase inline supplier cancel reopen and late creation preserve the draft ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await mockApiRoutes(page);
    await page.route("**/api/v1/purchases/qa-editor-draft", (route) =>
      route.fulfill({
        json: {
          code: 200,
          data: {
            id: "qa-editor-draft",
            supplierId: suppliers[0].id,
            contractNo: "SYNTHETIC-QA-DRAFT",
            status: "DRAFT",
            taxRate: 13,
            items: [
              { productId: "p-1", quantity: 2, unitPrice: 10, unit: "件" },
            ],
          },
        },
      }),
    );
    const late = gate();
    let writes = 0;
    let completed = 0;
    await page.route("**/api/v1/suppliers**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: catalog() });
        return;
      }
      writes += 1;
      if (writes === 1)
        await route.fulfill({
          status: 500,
          json: { code: 500, message: "合成保存失败", data: null },
        });
      else {
        await late.promise;
        await route.fulfill({
          json: {
            code: 201,
            data: {
              ...suppliers[0],
              id: "qa-created-supplier",
              ...route.request().postDataJSON(),
            },
          },
        });
      }
      completed += 1;
    });
    await signInAsAdmin(
      page,
      "/dashboard/purchase/create?editId=qa-editor-draft",
    );
    await expect(page.getByRole("spinbutton", { name: /数量/ })).toHaveValue(
      "2",
    );
    await page.getByRole("button", { name: "下一步：合同信息" }).click();
    await page.getByRole("button", { name: "新增", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "新增供应商",
      exact: true,
    });
    await dialog.getByLabel("供应商名称 *").fill("合成未提交草稿");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await expect(dialog.getByLabel("供应商名称 *")).toHaveValue("");
    await dialog.getByLabel("供应商名称 *").fill("合成已提交供应商");
    await dialog.getByLabel("联系人", { exact: true }).fill("合成可重试联系人");
    await dialog
      .getByRole("button", { name: "保存供应商", exact: true })
      .click();
    await expect(
      page.getByText("创建供应商失败", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel("联系人", { exact: true })).toHaveValue(
      "合成可重试联系人",
    );
    await dialog
      .getByRole("button", { name: "保存供应商", exact: true })
      .click();
    await expect.poll(() => writes).toBe(2);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await dialog.getByLabel("供应商名称 *").fill("合成新会话草稿");
    late.release();
    await expect.poll(() => completed).toBe(2);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("供应商名称 *")).toHaveValue(
      "合成新会话草稿",
    );
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.getByRole("combobox", { name: /供应商/ })).toHaveText(
      "合成供应商甲",
    );
    expect(writes).toBe(2);
    expect(pageErrors).toEqual([]);
  });
}
