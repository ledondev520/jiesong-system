/**
 * Input: Real role fixture, ADMIN menu UI (OD-8: the export packet is ADMIN only), isolated Express/SQLite and XLSX downloads
 * Output: Two prerequisite, cancellation and four-sheet workbook-content cases
 * Pos: Hosted browser acceptance for the four commercial documents
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
rows:Array.from({length:s.rowCount},(_,i)=>Array.from({length:s.columnCount},(_,j)=>{const v=s.getCell(i+1,j+1).value;return v?.result??v;}))}))));})().catch(()=>process.exit(1));`;
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
 * 职责：真实 ADMIN（FINANCE 角色画像，OD-8 映射为 ADMIN）登录后经出口菜单和合同卡片进入详情
 * @param page 当前验收页面
 * @returns 当前合成 ADMIN 用户的登录令牌
 * @throws 登录、菜单导航或详情标题断言失败
 */
async function enterFromMenu(page: Page) {
  const token = await loginAs(page, fixture, "FINANCE");
  await page
    .getByRole("link", { name: "出口订单", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard\/orders$/);
  await page.getByRole("link", { name: fixture.salesNo!, exact: true }).click();
  await expect(page).toHaveURL(`/dashboard/orders/${fixture.salesId}`);
  await expect(
    page.getByRole("heading", { name: fixture.salesNo!, exact: true }),
  ).toBeVisible();
  return token;
}
/**
 * 职责：从合同详情打开商业出口四单工作台
 * @param page 已进入合成合同详情的页面
 * @returns 当前合同的商业四单弹窗定位器
 * @throws 入口点击失败或页面关闭
 */
async function openPacket(page: Page) {
  await page.getByRole("button", { name: "单证", exact: true }).click();
  await page.getByRole("menuitem", { name: /生成出口四单/ }).click();
  return page.getByRole("dialog", {
    name: `出口四单工作台 · ${fixture.salesNo}`,
  });
}
/**
 * 职责：填写合成买卖方和单证日期，并核对固定包装种类
 * @param dialog 当前商业四单弹窗
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
  await expect(dialog.getByLabel("包装种类", { exact: true })).toHaveValue(
    "纸制或纤维板制盒/箱（22）",
  );
  await expect(dialog.getByLabel("包装种类", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await dialog.locator('input[type="date"]').fill("2026-10-01");
}
/**
 * 职责：执行商业四单只读预检并等待可以生成的真实结果
 * @param page 当前合同详情页面
 * @param dialog 已填写必需元数据的商业四单弹窗
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

test("ADMIN commercial prerequisites and cancelled preview do not reprice or archive", async ({
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
  // owner 14:33 rule: 11.3 × 1.3 ÷ 7 = 2.10 is under $10 → nearest 0.5 = 2 USD per piece × 10
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

test("ADMIN commercial confirmation downloads four accurate sheets and archived re-download keeps identical bytes", async ({
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
    "报关预录信息",
  ]);
  for (const name of ["外销合同", "商业发票"]) {
    expect(sheet(data, name)[3][1]).toBe("合成卖方");
    expect(sheet(data, name)[4][1]).toBe("合成买方");
    expect(sheet(data, name)[4][6]).toBe("2026-10-01");
    expect(sheet(data, name)[9][1]).toBe(productName);
    expect(sheet(data, name)[9][7]).toBe(preview.summary.totalUsd);
  }
  expect(sheet(data, "装箱单")[9].slice(5, 9)).toEqual([2, 20, 18, 0.2]);
  expect(sheet(data, "报关预录信息")[11][7]).toBe(preview.summary.totalUsd);
  expect(sheet(data, "报关预录信息")[12][7]).toBe(preview.summary.totalUsd);
  await expect(dialog).not.toBeVisible();
  const saved = readExportDocuments(fixture);
  expect(saved.sales_contract_files).toHaveLength(1);
  expect(saved.sales_contract_files[0].id).toBe(generated.file.id);
  await page.reload();
  // 已归档文件列在订单详情的「单证」页签；重载后默认回到概览。
  await page.getByRole("tab", { name: "单证", exact: true }).click();
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
