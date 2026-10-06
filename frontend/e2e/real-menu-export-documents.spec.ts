/**
 * Input: Real role fixture, SALES menu UI, isolated Express/SQLite and XLSX downloads
 * Output: Six prerequisite, generation, cancellation, retry and workbook-content cases
 * Pos: Hosted browser acceptance for internal customs/refund and commercial documents
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  test,
  expect,
  type Page,
  type Download,
  type Locator,
} from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  readExportDocuments,
  type RoleFixture,
} from "./real-role-fixture";

type Workbook = { name: string; rows: (string | number | null)[][] }[];
const productName = "合成角色验收商品";
/**
 * 职责：等待指定真实业务写请求的响应
 * @param page 当前验收页面
 * @param pathname 不含 API 前缀的业务路径
 * @returns 匹配 POST 请求的响应 Promise
 * @throws 页面关闭或等待超时时由 Playwright 拒绝
 */
const mutation = (page: Page, pathname: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1${pathname}` &&
      response.request().method() === "POST",
  );
const threeHeaders = [
  "序号",
  "商品名称",
  "HS 编码",
  "数量",
  "单位",
  "单价 (USD)",
  "总价 (USD)",
  "申报要素",
];
/**
 * 职责：读取实际浏览器下载并验证工作簿 ZIP 标记
 * @param download 当前合成工作簿的下载事件
 * @returns 完整下载字节
 * @throws 下载流缺失、读取失败或格式标记不符
 */
async function downloadBytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Synthetic workbook download has no stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  return bytes;
}
/**
 * 职责：用锁定的后端 ExcelJS 解析下载字节为可断言的表格数据
 * @param bytes 实际 XLSX 下载字节
 * @returns 工作表名称及单元格值
 * @throws 解析子进程失败、超时或输出不是合法 JSON
 */
function workbook(bytes: Buffer): Workbook {
  // Reuse the backend's locked ExcelJS in a normal Node child, no new dependency.
  const script = `const fs=require('node:fs'); const ExcelJS=require('exceljs');
(async()=>{const w=new ExcelJS.Workbook();await w.xlsx.load(fs.readFileSync(0));
process.stdout.write(JSON.stringify(w.worksheets.map(s=>({name:s.name,
rows:Array.from({length:s.rowCount},(_,i)=>Array.from({length:s.columnCount},(_,j)=>s.getCell(i+1,j+1).value))}))));})().catch(()=>process.exit(1));`;
  return JSON.parse(
    execFileSync(process.execPath, ["-e", script], {
      cwd: path.resolve("../backend"),
      input: bytes,
      encoding: "utf8",
      timeout: 10000,
    }),
  ) as Workbook;
}
/**
 * 职责：按名称取得已解析工作表的行数据
 * @param data 下载字节解析出的全部工作表
 * @param name 期望的工作表名称
 * @returns 指定工作表的单元格行数组
 * @throws 指定工作表不存在
 */
function sheet(data: Workbook, name: string) {
  const result = data.find((entry) => entry.name === name);
  if (!result) throw new Error(`Missing downloaded worksheet ${name}`);
  return result.rows;
}

let fixture: RoleFixture;
let pageErrors: string[];
test.setTimeout(90000);
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  fixture = await startRoleFixture("menu-export-documents");
  await forwardRealApi(page, fixture);
});
test.afterEach(async () => {
  if (fixture) await stopRoleFixture(fixture);
  expect(pageErrors).toEqual([]);
});
/**
 * 职责：真实 SALES 登录后经出口菜单和合同卡片进入详情
 * @param page 当前验收页面
 * @returns 当前合成 SALES 用户的登录令牌
 * @throws 登录、菜单导航或详情标题断言失败
 */
async function enterFromMenu(page: Page) {
  const token = await loginAs(page, fixture, "SALES");
  await page.getByRole("link", { name: "出口", exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/sales$/);
  await page
    .getByRole("button", { name: `查看合同 ${fixture.salesNo}`, exact: true })
    .click();
  await expect(page).toHaveURL(`/dashboard/sales/${fixture.salesId}`);
  await expect(
    page.getByRole("heading", { name: fixture.salesNo!, exact: true }),
  ).toBeVisible();
  return token;
}
/**
 * 职责：从合同详情打开申报三表并等待真实准备度校验
 * @param page 已进入合成合同详情的页面
 * @returns 可以明确提交生成的弹窗定位器
 * @throws 入口缺失或准备度未通过时断言失败
 */
async function openForms(page: Page) {
  await page.getByRole("button", { name: "生成申报三表", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "一键生成出口三张表" });
  await expect(dialog.getByRole("button", { name: /^确认生成/ })).toBeEnabled();
  return dialog;
}
/**
 * 职责：明确生成申报三表并收集真实记录 ID 和下载字节
 * @param page 当前合同详情页面
 * @param dialog 已通过准备度校验的申报三表弹窗
 * @returns 生成记录 ID、下载事件及完整工作簿字节
 * @throws 真实响应、弹窗关闭或下载断言失败
 */
async function generateForms(page: Page, dialog: Locator) {
  const response = mutation(page, "/three-forms/generate");
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /^确认生成/ }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const ids = (await result.json()).data as {
    customsDeclarationId: string;
    forexId: string;
    taxRefundId: string;
  };
  const download = await downloading;
  await expect(dialog).not.toBeVisible();
  return { ids, download, bytes: await downloadBytes(download) };
}
/**
 * 职责：从合同详情打开商业出口三单工作台
 * @param page 已进入合成合同详情的页面
 * @returns 当前合同的商业三单弹窗定位器
 * @throws 入口点击失败或页面关闭
 */
async function openPacket(page: Page) {
  await page
    .getByRole("button", { name: "出口三单工作台", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: `出口三单工作台 · ${fixture.salesNo}`,
  });
}
/**
 * 职责：填写确定性的合成买卖方、包装种类及单证日期
 * @param dialog 当前商业三单弹窗
 * @returns 填写完成的 Promise，不提交生成请求
 * @throws 必要字段不可操作时由 Playwright 拒绝
 */
async function fillPacket(dialog: Locator) {
  await dialog
    .getByText("买方名称", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("合成买方");
  await dialog
    .getByText("卖方名称", { exact: true })
    .locator("..")
    .getByRole("textbox")
    .fill("合成卖方");
  await dialog.getByPlaceholder("例如：纸箱、木箱或纸箱+木箱").fill("CARTON");
  await dialog.locator('input[type="date"]').fill("2026-10-01");
}
/**
 * 职责：执行商业三单只读预检并等待可以生成的真实结果
 * @param page 当前合同详情页面
 * @param dialog 已填写必需元数据的商业三单弹窗
 * @returns 后端权威预检数据
 * @throws 请求失败、解析失败或准备度断言失败
 */
async function previewPacket(page: Page, dialog: Locator) {
  const completed = mutation(
    page,
    `/sales/${fixture.salesId}/export-packet/preview`,
  );
  await dialog.getByRole("button", { name: "重新预检", exact: true }).click();
  const response = await completed;
  expect(response.status()).toBe(200);
  await expect(dialog.getByText("可以生成", { exact: true })).toBeVisible();
  return (await response.json()).data;
}

test("SALES menu prerequisites and cancelled three-form preview write no records", async ({
  page,
}) => {
  await enterFromMenu(page);
  const before = readExportDocuments(fixture);
  const dialog = await openForms(page);
  await dialog.getByLabel(`${productName} HS 编码`).fill("9999999998");
  await expect(
    dialog.getByRole("button", { name: /^确认生成/ }),
  ).toBeDisabled();
  await expect(
    dialog.getByText(/当前税则快照中没有该 HS 编码/).first(),
  ).toBeVisible();
  expect(readExportDocuments(fixture)).toEqual(before);
  await dialog.getByLabel(`${productName} HS 编码`).fill("9999999999");
  await expect(dialog.getByRole("button", { name: /^确认生成/ })).toBeEnabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await openForms(page);
  expect(readExportDocuments(fixture)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("SALES menu generates linked internal drafts, downloads intact customs workbook and reads records after reload", async ({
  page,
}) => {
  await enterFromMenu(page);
  const dialog = await openForms(page);
  const { ids, download, bytes } = await generateForms(page, dialog);
  expect(download.suggestedFilename()).toContain(fixture.salesNo!);
  const saved = readExportDocuments(fixture);
  expect(saved.customs_declarations).toHaveLength(1);
  expect(saved.forex_verifications).toHaveLength(1);
  expect(saved.tax_refunds).toHaveLength(1);
  expect(saved.customs_declarations[0]).toMatchObject({
    id: ids.customsDeclarationId,
    status: "DRAFT",
    totalAmount: 20,
    totalQuantity: 10,
  });
  expect(saved.customs_declaration_items[0]).toMatchObject({
    packingItemId: fixture.exportDocuments!.packingItemId,
    productId: fixture.productId,
    hsCode: "9999999999",
    quantity: 10,
    unitPrice: 2,
    totalPrice: 20,
  });
  expect(saved.forex_verifications[0]).toMatchObject({
    id: ids.forexId,
    customsDeclarationId: ids.customsDeclarationId,
    status: "PENDING",
    receivedAmount: 20,
    settledAmount: 0,
  });
  expect(saved.tax_refunds[0]).toMatchObject({
    id: ids.taxRefundId,
    customsDeclarationId: ids.customsDeclarationId,
    forexVerificationId: ids.forexId,
    status: "DRAFT",
    declaredAmount: 100,
    refundableAmount: 13,
    refundedAmount: 0,
  });
  const data = workbook(bytes);
  expect(data.map((entry) => entry.name)).toEqual([
    "报关单",
    "外汇核销单",
    "出口退税申报表",
  ]);
  expect(sheet(data, "报关单")[0][0]).toBe(
    `出口货物报关单 — ${fixture.salesNo}`,
  );
  expect(sheet(data, "报关单")[3]).toEqual(threeHeaders);
  expect(sheet(data, "报关单")[4]).toEqual([
    1,
    productName,
    "9999999999",
    10,
    "件",
    2,
    20,
    "合成测试要素",
  ]);
  expect(sheet(data, "出口退税申报表")[4][1]).toBe("13.00");
  await page
    .getByRole("link", { name: "出口退税", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "报关单", exact: true }).click();
  await page
    .getByRole("button", {
      name: `查看详情 ${saved.customs_declarations[0].declarationNo}`,
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: String(saved.customs_declarations[0].declarationNo),
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("USD 20", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "出口退税", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "退税记录", exact: true }).click();
  await page
    .getByRole("button", {
      name: `查看详情 ${saved.tax_refunds[0].refundNo}`,
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: String(saved.tax_refunds[0].refundNo),
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("预计值：", { exact: false })).toBeVisible();
  expect(readExportDocuments(fixture)).toEqual(saved);
});

test("SALES repeated click sends one generation, while explicit later generation appends the existing version", async ({
  page,
}) => {
  await enterFromMenu(page);
  const dialog = await openForms(page);
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/three-forms/generate", async (route) => {
    requests += 1;
    const response = await route.fetch({
      url: `${fixture.baseURL}/api/v1/three-forms/generate`,
      maxRedirects: 0,
    });
    await gate;
    await route.fulfill({ response });
  });
  const downloading = page.waitForEvent("download");
  try {
    await dialog.getByRole("button", { name: /^确认生成/ }).dblclick();
    await expect
      .poll(() => readExportDocuments(fixture).customs_declarations.length)
      .toBe(1);
    expect(requests).toBe(1);
    await expect(
      dialog.getByRole("button", { name: "生成中...", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  const first = workbook(await downloadBytes(await downloading));
  await expect(dialog).not.toBeVisible();
  await page.unroute("**/api/v1/three-forms/generate");
  const nextDialog = await openForms(page);
  const second = await generateForms(page, nextDialog);
  const rows = readExportDocuments(fixture);
  expect(rows.customs_declarations).toHaveLength(2);
  expect(rows.forex_verifications).toHaveLength(2);
  expect(rows.tax_refunds).toHaveLength(2);
  const declaration = rows.customs_declarations.find(
    (row) => row.id === second.ids.customsDeclarationId,
  )!;
  expect(declaration.declarationNo).toBe("BGP-SYNTHETIC-MENU-DOCS-2");
  expect(sheet(first, "报关单")[1][1]).toBe("BGP-SYNTHETIC-MENU-DOCS");
  expect(sheet(workbook(second.bytes), "报关单")[1][1]).toBe(
    declaration.declarationNo,
  );
});

test("SALES commercial prerequisites and cancelled preview do not reprice or archive", async ({
  page,
}) => {
  await enterFromMenu(page);
  const before = readExportDocuments(fixture);
  const dialog = await openPacket(page);
  await expect(
    dialog.getByRole("button", { name: "重新预检", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "确认生成、归档并下载", exact: true }),
  ).toBeDisabled();
  await fillPacket(dialog);
  const preview = await previewPacket(page, dialog);
  expect(preview.summary.totalUsd).toBe(20);
  expect(preview.summary.purchaseCostCny).toBe(113);
  expect(readExportDocuments(fixture)).toEqual(before);
  await dialog
    .locator('[data-slot="dialog-footer"]')
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.reload();
  const reopened = await openPacket(page);
  await expect(
    reopened.getByRole("button", { name: "确认生成、归档并下载", exact: true }),
  ).toBeDisabled();
  expect(readExportDocuments(fixture)).toEqual(before);
});

test("SALES commercial confirmation downloads three accurate sheets and archived re-download keeps identical bytes", async ({
  page,
}) => {
  await enterFromMenu(page);
  const dialog = await openPacket(page);
  await fillPacket(dialog);
  const preview = await previewPacket(page, dialog);
  const completed = mutation(
    page,
    `/sales/${fixture.salesId}/export-packet/generate`,
  );
  const downloading = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "确认生成、归档并下载", exact: true })
    .click();
  const response = await completed;
  expect(response.status()).toBe(201);
  const generated = (await response.json()).data;
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(generated.file.fileName);
  const bytes = await downloadBytes(download);
  expect(bytes.length).toBe(generated.file.fileSize);
  const data = workbook(bytes);
  expect(data.map((entry) => entry.name)).toEqual([
    "外销合同",
    "商业发票",
    "装箱单",
  ]);
  for (const name of ["外销合同", "商业发票"]) {
    expect(sheet(data, name)[3][1]).toBe("合成卖方");
    expect(sheet(data, name)[4][1]).toBe("合成买方");
    expect(sheet(data, name)[4][6]).toBe("2026-10-01");
    expect(sheet(data, name)[9][1]).toBe(productName);
    expect(sheet(data, name)[9][7]).toBe(preview.summary.totalUsd);
  }
  expect(sheet(data, "装箱单")[9].slice(5, 9)).toEqual([2, 20, 18, 0.2]);
  await expect(dialog).not.toBeVisible();
  const saved = readExportDocuments(fixture);
  expect(saved.sales_contract_files).toHaveLength(1);
  expect(saved.sales_contract_files[0].id).toBe(generated.file.id);
  await page.reload();
  const again = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: `下载${generated.file.fileName}`,
      exact: true,
    })
    .click();
  expect(await downloadBytes(await again)).toEqual(bytes);
  expect(readExportDocuments(fixture)).toEqual(saved);
});

test("SALES genuine generation error preserves the dialog and explicit repaired retry creates one draft set", async ({
  page,
  request,
}) => {
  const token = await enterFromMenu(page);
  const dialog = await openForms(page);
  const route = `${fixture.baseURL}/api/v1/sales/${fixture.salesId}/packing-items/${fixture.exportDocuments!.packingItemId}`;
  const options = { headers: { authorization: `Bearer ${token}` } };
  expect(
    (await request.put(route, { ...options, data: { unitPrice: 0 } })).status(),
  ).toBe(200);
  const changed = readExportDocuments(fixture);
  let attempts = 0;
  page.on("request", (incoming) => {
    if (new URL(incoming.url()).pathname === "/api/v1/three-forms/generate")
      attempts += 1;
  });
  const failed = mutation(page, "/three-forms/generate");
  await dialog.getByRole("button", { name: /^确认生成/ }).click();
  expect((await failed).status()).toBe(400);
  await expect(page.getByText(/缺少出口单价/).first()).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(`${productName} HS 编码`)).toHaveValue(
    "9999999999",
  );
  await expect(dialog.getByRole("button", { name: /^确认生成/ })).toBeEnabled();
  expect(attempts).toBe(1);
  expect(readExportDocuments(fixture)).toEqual(changed);
  expect(
    (await request.put(route, { ...options, data: { unitPrice: 2 } })).status(),
  ).toBe(200);
  await generateForms(page, dialog);
  expect(attempts).toBe(2);
  const saved = readExportDocuments(fixture);
  expect(saved.customs_declarations).toHaveLength(1);
  expect(saved.forex_verifications).toHaveLength(1);
  expect(saved.tax_refunds).toHaveLength(1);
});
