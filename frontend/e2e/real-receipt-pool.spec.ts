/** Real receipt-pool UI → authenticated Express/SQLite allocation, never business API mocks. */
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  readReceiptPool,
  type RoleFixture,
} from "./real-role-fixture";

test.setTimeout(90000);
test.use({ viewport: { width: 1440, height: 900 } });

let fixture: RoleFixture;
let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  fixture = await startRoleFixture("receipt-pool");
  await forwardRealApi(page, fixture);
});
test.afterEach(async () => {
  if (fixture) await stopRoleFixture(fixture);
  expect(pageErrors).toEqual([]);
});

function poolMetadata() {
  if (!fixture.receiptPool)
    throw new Error("Receipt-pool fixture metadata missing");
  return fixture.receiptPool;
}

const allocationResponse = (page: Page, paymentId: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/finance/payments/${paymentId}/allocate` &&
      response.request().method() === "POST",
  );

const sourceRow = (page: Page, currency: "USD" | "CNY") =>
  page
    .getByText(`合成收款池${currency}客户`, { exact: true })
    .locator("..")
    .locator("..")
    .locator("..");

async function selectAllocation(
  dialog: Locator,
  contractNo: string,
  amount: string,
) {
  const checkbox = dialog.getByRole("checkbox", {
    name: contractNo,
    exact: true,
  });
  await checkbox.check();
  await checkbox.locator("..").getByRole("spinbutton").fill(amount);
}

async function expectContractBalance(
  page: Page,
  contractNo: string,
  total: number,
  received: number,
) {
  const row = page.getByRole("row").filter({
    has: page.getByText(contractNo, { exact: true }),
  });
  await expect(row.getByRole("cell").nth(3)).toHaveText(
    total.toLocaleString("en-US"),
  );
  await expect(row.getByRole("cell").nth(4)).toHaveText(
    received.toLocaleString("en-US"),
  );
  await expect(row.getByRole("cell").nth(5)).toHaveText(
    (total - received).toLocaleString("en-US"),
  );
}

test("FINANCE splits a USD receipt, reloads real balances and consumes only its remainder", async ({
  page,
  request,
}) => {
  const token = await loginAs(page, fixture, "FINANCE");
  const pool = poolMetadata();
  const [first, second] = pool.contracts;
  await page.goto("/dashboard/payments?tab=receivable");
  await expect(sourceRow(page, "USD")).toContainText("剩余待分配 USD 1,000");
  await expectContractBalance(page, first.contractNo, 800, 0);
  await expectContractBalance(page, second.contractNo, 1000, 0);
  const initial = readReceiptPool(fixture);
  const originalSource = initial.payments.find(
    (row) => row.id === pool.usdReceiptId,
  )!;

  await sourceRow(page, "USD")
    .getByRole("button", { name: "分配", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "分配收款", exact: true });
  await selectAllocation(dialog, first.contractNo, "300");
  await selectAllocation(dialog, second.contractNo, "200");
  const allocated = allocationResponse(page, pool.usdReceiptId);
  await dialog
    .getByRole("button", { name: "确认分配 USD 500.00", exact: true })
    .click();
  expect((await allocated).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  await expect(sourceRow(page, "USD")).toContainText("剩余待分配 USD 500");
  await expectContractBalance(page, first.contractNo, 800, 300);
  await expectContractBalance(page, second.contractNo, 1000, 200);

  const partial = readReceiptPool(fixture);
  expect(partial.payments.find((row) => row.id === pool.usdReceiptId)).toEqual(
    originalSource,
  );
  const allocations = partial.payments.filter(
    (row) => row.sourcePaymentId === pool.usdReceiptId,
  );
  expect(allocations).toHaveLength(2);
  expect(
    allocations.map((row) => [row.salesContractId, row.amount]).sort(),
  ).toEqual(
    [
      [first.id, 300],
      [second.id, 200],
    ].sort(),
  );
  expect(
    allocations.every(
      (row) =>
        row.type === "RECEIVABLE_COLLECTION" &&
        row.currency === "USD" &&
        row.customerName === originalSource.customerName &&
        row.paymentDate === originalSource.paymentDate &&
        row.paymentMethod === originalSource.paymentMethod,
    ),
  ).toBe(true);
  expect(partial.contracts.map((row) => row.receivedAmount)).toEqual([
    300, 200,
  ]);
  const contractRead = await request.get(
    `${fixture.baseURL}/api/v1/sales/${first.id}`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  expect(contractRead.status()).toBe(200);
  expect((await contractRead.json()).data.receivedAmount).toBe(300);

  await page.reload();
  await expect(sourceRow(page, "USD")).toContainText("剩余待分配 USD 500");
  await expectContractBalance(page, first.contractNo, 800, 300);
  await expectContractBalance(page, second.contractNo, 1000, 200);
  expect(readReceiptPool(fixture)).toEqual(partial);
  await sourceRow(page, "USD")
    .getByRole("button", { name: "分配", exact: true })
    .click();
  await expect(dialog).toContainText("到账 USD 500");
  await selectAllocation(dialog, second.contractNo, "500");
  const completed = allocationResponse(page, pool.usdReceiptId);
  await dialog
    .getByRole("button", { name: "确认分配 USD 500.00", exact: true })
    .click();
  expect((await completed).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("合成收款池USD客户", { exact: true }),
  ).toHaveCount(0);
  await expect(sourceRow(page, "CNY")).toContainText("剩余待分配 CNY 500");
  await expectContractBalance(page, second.contractNo, 1000, 700);

  const full = readReceiptPool(fixture);
  expect(full.payments.find((row) => row.id === pool.usdReceiptId)).toEqual({
    ...originalSource,
    type: "RECEIVABLE_RECEIPT_ALLOCATED",
  });
  const fullAllocations = full.payments.filter(
    (row) => row.sourcePaymentId === pool.usdReceiptId,
  );
  expect(fullAllocations).toHaveLength(3);
  expect(
    fullAllocations.every(
      (row) =>
        row.type === "RECEIVABLE_COLLECTION" &&
        row.currency === "USD" &&
        row.customerName === originalSource.customerName &&
        row.paymentDate === originalSource.paymentDate &&
        row.paymentMethod === originalSource.paymentMethod,
    ),
  ).toBe(true);
  expect(fullAllocations.reduce((sum, row) => sum + row.amount, 0)).toBe(
    originalSource.amount,
  );
  expect(full.payments.find((row) => row.id === pool.cnyReceiptId)).toEqual(
    initial.payments.find((row) => row.id === pool.cnyReceiptId),
  );
  expect(full.contracts.map((row) => row.receivedAmount)).toEqual([300, 700]);
  await page.reload();
  await expect(
    page.getByText("合成收款池USD客户", { exact: true }),
  ).toHaveCount(0);
  await expectContractBalance(page, first.contractNo, 800, 300);
  await expectContractBalance(page, second.contractNo, 1000, 700);
  expect(readReceiptPool(fixture)).toEqual(full);
});

test("FINANCE rejected CNY allocation retains its draft for retry and cancel never writes", async ({
  page,
}) => {
  await loginAs(page, fixture, "FINANCE");
  const pool = poolMetadata();
  const contract = pool.contracts[0];
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname ===
        `/api/v1/finance/payments/${pool.cnyReceiptId}/allocate` &&
      request.method() === "POST"
    ) {
      writes.push(request.postData() || "");
    }
  });
  await page.goto("/dashboard/payments?tab=receivable");
  const before = readReceiptPool(fixture);
  await sourceRow(page, "CNY")
    .getByRole("button", { name: "分配", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "分配收款", exact: true });
  await selectAllocation(dialog, contract.contractNo, "125");
  const amount = dialog
    .getByRole("checkbox", { name: contract.contractNo, exact: true })
    .locator("..")
    .getByRole("spinbutton");
  const submit = dialog.getByRole("button", {
    name: "确认分配 CNY 125.00",
    exact: true,
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rejected = allocationResponse(page, pool.cnyReceiptId);
    await submit.click();
    const response = await rejected;
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toContain("只支持 USD");
    await expect(dialog).toBeVisible();
    await expect(amount).toHaveValue("125");
    await expect(
      dialog.getByRole("checkbox", { name: contract.contractNo, exact: true }),
    ).toBeChecked();
    await expect(submit).toBeEnabled();
    await expect(
      page.getByText("分配失败，请重试", { exact: true }).last(),
    ).toBeVisible();
    expect(readReceiptPool(fixture)).toEqual(before);
    expect(writes).toHaveLength(attempt + 1);
  }
  expect(writes[1]).toBe(writes[0]);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(readReceiptPool(fixture)).toEqual(before);
  expect(writes).toHaveLength(2);
  await sourceRow(page, "CNY")
    .getByRole("button", { name: "分配", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: contract.contractNo, exact: true }),
  ).not.toBeChecked();
  await expect(amount).toHaveValue("");
  await expect(
    dialog.getByRole("button", { name: "确认分配 CNY 0.00", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(sourceRow(page, "CNY")).toContainText("剩余待分配 CNY 500");
  await expectContractBalance(page, contract.contractNo, 800, 0);
  expect(readReceiptPool(fixture)).toEqual(before);
  expect(writes).toHaveLength(2);
});

test("BOSS sees receipt-pool balances but allocation and automatch stay read-only", async ({
  page,
  request,
}) => {
  const token = await loginAs(page, fixture, "BOSS");
  const pool = poolMetadata();
  await page.goto("/dashboard/payments?tab=receivable");
  await expect(sourceRow(page, "USD")).toContainText("剩余待分配 USD 1,000");
  await expect(sourceRow(page, "CNY")).toContainText("剩余待分配 CNY 500");
  await expectContractBalance(page, pool.contracts[0].contractNo, 800, 0);
  await expect(
    page.getByRole("button", { name: "分配", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "自动匹配", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "记录到账", exact: true }),
  ).toHaveCount(0);
  const before = readReceiptPool(fixture);
  for (const [pathname, data] of [
    [
      `/finance/payments/${pool.usdReceiptId}/allocate`,
      { allocations: [{ salesContractId: pool.contracts[0].id, amount: 100 }] },
    ],
    ["/finance/payments/auto-match", {}],
  ] as const) {
    const denied = await request.post(`${fixture.baseURL}/api/v1${pathname}`, {
      headers: { authorization: `Bearer ${token}` },
      data,
    });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).message).toContain("老板角色仅可查看业务");
    expect(readReceiptPool(fixture)).toEqual(before);
  }
  await page.reload();
  await expect(sourceRow(page, "USD")).toContainText("剩余待分配 USD 1,000");
  await expect(
    page.getByRole("button", { name: "分配", exact: true }),
  ).toHaveCount(0);
  expect(readReceiptPool(fixture)).toEqual(before);
});
