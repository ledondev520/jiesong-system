/** Synthetic browser transport regression: real XHR header validation, no real payments. */
import { test, expect } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

for (const width of [390, 1440]) {
  test(`中文付款备注可提交，失败保留草稿，重试关闭并刷新 ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApiRoutes(page);
    const note = "内部付款测试：中文备注 🚚，仅合成数据";
    const contract = {
      id: "pc-001",
      contractNo: "SYNTHETIC-PAYMENT",
      status: "SIGNED",
      totalAmount: 100,
      paidAmount: 0,
      taxRate: 0,
      supplier: { id: "synthetic-supplier", name: "合成供应商" },
      items: [
        {
          id: "synthetic-item",
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          product: { customsName: "合成商品", unit: "件" },
        },
      ],
      payments: [] as Record<string, unknown>[],
    };
    let contractReads = 0;
    await page.route("**/api/v1/purchases/pc-001", async (route) => {
      expect(route.request().method()).toBe("GET");
      contractReads++;
      await route.fulfill({ json: { code: 200, data: contract } });
    });
    const attempts: { key: string; body: Record<string, unknown> }[] = [];
    let releaseFailure!: () => void;
    const firstResponse = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.route("**/api/v1/finance/payments", async (route) => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      const key = request.headers()["x-idempotency-key"];
      const body = request.postDataJSON();
      expect(key).toMatch(/^idempotency:sha256:[a-f0-9]{64}$/);
      expect(key).toHaveLength(83);
      expect(body).toMatchObject({
        amount: 22.6,
        currency: "CNY",
        paymentMethod: "other",
        note,
      });
      attempts.push({ key, body });
      if (attempts.length === 1) {
        await firstResponse;
        await route.fulfill({
          status: 503,
          json: { code: 503, message: "合成网络故障，请重试" },
        });
        return;
      }
      contract.paidAmount = 22.6;
      contract.payments = [{ ...body, id: "synthetic-payment" }];
      await route.fulfill({
        status: 201,
        json: { code: 201, data: contract.payments[0] },
      });
    });
    await signInAsAdmin(page, "/dashboard/purchase/pc-001");
    const open = () =>
      page.getByRole("button", { name: "登记付款", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "录入付款" });
    const fill = async () => {
      await dialog.getByLabel("付款金额").fill("22.6");
      await dialog.getByRole("combobox", { name: "方式", exact: true }).click();
      await page.getByRole("option", { name: "其他", exact: true }).click();
      await dialog.getByLabel("备注").fill(note);
    };
    await open();
    await fill();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(attempts).toHaveLength(0);
    await open();
    await expect(dialog.getByLabel("备注")).toHaveValue("");
    await fill();
    const originalDate = await dialog.locator("#payment-date").innerText();
    await dialog.getByRole("button", { name: "确认记录", exact: true }).click();
    await expect.poll(() => attempts.length).toBe(1);
    await dialog.locator("form").dispatchEvent("submit");
    await expect(
      dialog.getByRole("button", { name: "提交中..." }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "取消", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    releaseFailure();
    await expect(dialog.getByRole("alert")).toContainText("合成网络故障");
    await expect(dialog.getByLabel("付款金额")).toHaveValue("22.6");
    await expect(
      dialog.getByRole("combobox", { name: "方式", exact: true }),
    ).toContainText("其他");
    await expect(dialog.getByLabel("备注")).toHaveValue(note);
    await expect(dialog.locator("#payment-date")).toHaveText(originalDate);
    expect(attempts).toHaveLength(1);
    const beforeRefresh = contractReads;
    await dialog.getByRole("button", { name: "确认记录", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => contractReads).toBeGreaterThan(beforeRefresh);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    expect(attempts).toHaveLength(2);
  });
}
