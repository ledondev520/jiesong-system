/** Real authenticated upload, original-template XLSX download, manual repricing and role boundary. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect, type Download } from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  forwardRealApi,
  loginAs,
  readExportDocuments,
  testPassword,
  type RoleFixture,
} from "./real-role-fixture";

let fixture: RoleFixture;
test.beforeAll(async () => {
  fixture = await startRoleFixture("excel-export");
});
test.afterAll(async () => {
  if (fixture) await stopRoleFixture(fixture);
});

const excel = (multiple = false, automatic = false) =>
  execFileSync(
    process.execPath,
    [
      "-e",
      `
const ExcelJS=require('exceljs');(async()=>{const w=new ExcelJS.Workbook();const s=w.addWorksheet('出货总清单');
s.addRow(['报关名','商品补充信息','数量','单位','规格','箱数','毛重','净重','体积','合同号','报关公司','采购金额','出口单价(USD)']);
s.addRow(['合成铺饭机','两种设备及附件保持一条',4,'台',${automatic ? "'800*400*700'" : "'600*400*700'"},14,256,240,1.47,'EXP990001','捷淞',${automatic ? 2640 : 10000},${automatic ? "null" : 600}]);
s.addRow(['合成他方货物','',2,'件','100*100*100',2,20,18,0.2,'EXP990001','其他厂家报关',100,10]);
if(${multiple})s.addRow(['合成铺饭机','',4,'台','600*400*700',14,256,240,1.47,'EXP990002','捷淞',10000,600]);
process.stdout.write(Buffer.from(await w.xlsx.writeBuffer()));})().catch(()=>process.exit(1));`,
    ],
    { cwd: path.resolve("../backend") },
  );

const readDownload = async (download: Download) => {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("No workbook stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        `const fs=require('fs'),ExcelJS=require('exceljs');(async()=>{const w=new ExcelJS.Workbook();await w.xlsx.load(fs.readFileSync(0));const value=c=>c.value?.result??c.value;process.stdout.write(JSON.stringify({names:w.worksheets.map(s=>s.name),total:value(w.getWorksheet('合同').getCell('F25')),invoice:value(w.getWorksheet('发票').getCell('F25')),name:value(w.getWorksheet('箱单').getCell('B9')),quantity:value(w.getWorksheet('箱单').getCell('I9')),boxes:value(w.getWorksheet('箱单').getCell('E25')),next:value(w.getWorksheet('箱单').getCell('B10')),print:w.getWorksheet('合同').pageSetup.printArea}));})().catch(()=>process.exit(1));`,
      ],
      {
        cwd: path.resolve("../backend"),
        input: Buffer.concat(chunks),
        encoding: "utf8",
      },
    ),
  );
};

test("上传自动下载原版三单，人工改价后金额联动，手机界面可操作，业务库未改", async ({
  page,
}, testInfo) => {
  await forwardRealApi(page, fixture);
  await loginAs(page, fixture, "FINANCE");
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: "Excel 出三单", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excel 出三单" });
  const before = readExportDocuments(fixture);
  const downloading = page.waitForEvent("download");
  await dialog.getByLabel("上传出货汇总Excel").setInputFiles({
    name: "synthetic.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel(),
  });
  const first = await readDownload(await downloading);
  expect(first).toMatchObject({
    names: ["合同", "发票", "箱单"],
    total: 2400,
    invoice: 2400,
    name: "合成铺饭机",
    quantity: 4,
    boxes: 14,
    next: null,
    print: "A1:F44",
  });
  await expect(dialog.getByText("成本加价率", { exact: true })).toBeVisible();
  await expect(dialog.getByText("销售毛利率", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/另有 1 行/)).toBeVisible();
  await dialog.getByLabel("合成铺饭机出口单价").fill("650");
  await expect(dialog.getByRole("button", { name: "下载三单" })).toBeDisabled();
  await dialog.getByRole("button", { name: "重新计算" }).click();
  await expect(dialog.getByRole("button", { name: "下载三单" })).toBeEnabled();
  const secondDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载三单" }).click();
  expect(await readDownload(await secondDownload)).toMatchObject({
    total: 2600,
    invoice: 2600,
    quantity: 4,
    boxes: 14,
  });
  await page.screenshot({
    path: testInfo.outputPath("excel-export-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "下载三单" })).toBeVisible();
  await expect(dialog.getByLabel("本票现汇 CNY/USD")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("excel-export-mobile.png"),
  });
  expect(readExportDocuments(fixture)).toEqual(before);
});

test("多票选择后才生成；无登录和销售角色不能上传制单", async ({
  page,
  request,
}) => {
  await forwardRealApi(page, fixture);
  await loginAs(page, fixture, "FINANCE");
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: "Excel 出三单", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excel 出三单" });
  let count = 0;
  page.on("download", () => {
    count += 1;
  });
  await dialog.getByLabel("上传出货汇总Excel").setInputFiles({
    name: "multi.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel(true),
  });
  await expect(
    dialog.getByRole("combobox", { name: "本次合同号" }),
  ).toBeVisible();
  expect(count).toBe(0);
  await dialog.getByRole("combobox", { name: "本次合同号" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("option", { name: /EXP990002/ }).click();
  expect((await downloading).suggestedFilename()).toContain("EXP990002");
  const unauthenticated = await request.post(
    `${fixture.baseURL}/api/v1/sales/export-packet/excel/preview`,
    {
      multipart: {
        file: {
          name: "synthetic.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: excel(),
        },
        options: "{}",
      },
    },
  );
  expect(unauthenticated.status()).toBe(401);
  const salesLogin = await request.post(
    `${fixture.baseURL}/api/v1/auth/login`,
    {
      data: { username: fixture.users.SALES.username, password: testPassword },
    },
  );
  expect(salesLogin.status()).toBe(200);
  const token = (await salesLogin.json()).data.token;
  const forbidden = await request.post(
    `${fixture.baseURL}/api/v1/sales/export-packet/excel/preview`,
    {
      headers: { authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: "synthetic.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: excel(),
        },
        options: "{}",
      },
    },
  );
  expect(forbidden.status()).toBe(403);
});

test("自动报价按分档就近取整，利润偏离提示不阻止下载", async ({ page }) => {
  await forwardRealApi(page, fixture);
  await loginAs(page, fixture, "FINANCE");
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: "Excel 出三单", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Excel 出三单" });
  const downloading = page.waitForEvent("download");
  await dialog.getByLabel("上传出货汇总Excel").setInputFiles({
    name: "automatic.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel(false, true),
  });
  expect(await readDownload(await downloading)).toMatchObject({
    total: 600,
    invoice: 600,
  });
  await expect(dialog.getByText(/取整后成本加价率 50%/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "下载三单" })).toBeEnabled();
});
