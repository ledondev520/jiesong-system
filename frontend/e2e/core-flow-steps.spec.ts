/**
 * Input: 合成 API（mockApiRoutes + 本文件按步骤覆盖的路由），1440px，ADMIN 登录
 * Output: 核心业务流 12 步里此前没有任何 Playwright 用例的步骤的界面验收（A109 / 清理计划 Phase 0.4）
 * Pos: 与 real-* 真实 Express 用例互补：这里只证明页面入口、请求体与刷新，不证明后端语义
 *
 * 步骤 → 覆盖（同目录其余规格；后端真实 HTTP 链路见 backend/src/integration/trade-lifecycle.integration.js）：
 *  1 采购        本文件：订单「生成采购单」弹窗 → POST /sales/:id/purchase-drafts
 *  2 订单        quote-to-order / order-editor / orders / real-sales-header
 *  3 付定金      payment-roundtrip
 *  4 等生产      本文件：已签订合同的主动作是「登记完工资料」（界面没有单独的“开始生产”，PRODUCING 只剩后端兼容状态）
 *  5 生产完成    本文件：录入生产资料 →「保存并登记完工」→ PUT production-details completeProduction
 *  6 装柜/发运时机 real-export-3d、real-export-pdf、home-todos
 *  7 出口四单    real-menu-export-documents、real-excel-export
 *  8 发运        real-role-lifecycle（SALES 发运）
 *  9 装箱/货柜图 real-export-3d、real-export-pdf；本文件：船司装箱单核对
 * 10 出口到港完成 本文件：登记到港 → 完成订单
 * 11 报关草稿    本文件：「单证 ▾ → 报关单草稿」→ POST /customs-declarations/auto-drafts（手工报关表单见 real-role-lifecycle）
 * 12 退税工作台  本文件：退税工作台 → 准备清单 → 确认；申报表由离线脚本生成，见 scripts/build_tax_refund_declaration_tables.test.js
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { mockApiRoutes, signInAsAdmin } from "./helpers";

const store = { id: "st-1", name: "洛杉矶店", code: "LA01" };
const product = { id: "p-1", customsName: "不锈钢门", unit: "扇" };
const orderBase = {
  id: "sc-001",
  contractNo: "EXP2600001",
  signedAt: "2026-02-10T00:00:00.000Z",
  port: { id: "port-1", name: "洛杉矶港" },
  customer: { id: "c-1", name: "合成客户" },
  totalAmount: 22000,
  receivedAmount: 0,
  exchangeRate: 7.2,
  purchaseContracts: [],
  items: [
    {
      id: "si-1",
      productId: product.id,
      storeId: store.id,
      product,
      store,
      quantity: 20,
      unitPrice: 1100,
    },
  ],
  packingItems: [],
  createdAt: "2026-03-01T08:00:00.000Z",
  updatedAt: "2026-03-01T08:00:00.000Z",
};

const ok = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, json: { code: status, data } });

/** 把订单详情换成可变的合成订单；返回读取当前订单的引用。 */
async function routeOrder(page: Page, patch: Record<string, unknown>) {
  const order: Record<string, unknown> = { ...orderBase, ...patch };
  await page.route("**/api/v1/sales/sc-001", (route) =>
    route.request().method() === "GET" ? ok(route, order) : route.fallback(),
  );
  return order;
}

/** 记录某条路由的全部请求体，并按给定数据应答。 */
async function captureBodies(
  page: Page,
  url: string,
  method: string,
  respond: (body: Record<string, unknown>) => unknown,
  status = 200,
) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(url, (route) => {
    if (route.request().method() !== method) return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as Record<
      string,
      unknown
    >;
    bodies.push(body);
    return ok(route, respond(body), status);
  });
  return bodies;
}

test.describe("核心流程缺口（合成 API）", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApiRoutes(page);
  });

  test("步骤1：已确认订单生成采购单草稿，默认带最近供应商与价格", async ({
    page,
  }) => {
    await routeOrder(page, { status: "CONFIRMED" });
    await page.route("**/api/v1/purchases/price-history/p-1", (route) =>
      ok(route, {
        bySupplier: [
          {
            supplierId: "s-1",
            supplierName: "供应商A",
            lastDate: "2026-02-01",
            lastPrice: 80,
          },
        ],
      }),
    );
    const drafts = await captureBodies(
      page,
      "**/api/v1/sales/sc-001/purchase-drafts",
      "POST",
      () => ({ contracts: [{ id: "pc-new", contractNo: "CG2600099" }] }),
      201,
    );

    await signInAsAdmin(page, "/dashboard/orders/sc-001");
    await page.getByRole("button", { name: "生成采购单", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "生成采购单" });
    await dialog.getByRole("button", { name: "生成 1 行" }).click();

    await expect.poll(() => drafts.length).toBe(1);
    expect(drafts[0]).toEqual({
      lines: [{ salesItemId: "si-1", supplierId: "s-1", unitPrice: 80 }],
    });
    await expect(dialog).not.toBeVisible();
  });

  test("步骤4-5：已签订采购合同录入生产资料并登记完工", async ({ page }) => {
    const contract = {
      id: "pc-001",
      contractNo: "CG2600001",
      status: "SIGNED",
      totalAmount: 100,
      paidAmount: 0,
      taxRate: 0,
      supplier: { id: "s-1", name: "供应商A" },
      items: [
        { id: "pi-1", quantity: 1, unitPrice: 100, totalPrice: 100, product },
      ],
      payments: [],
    };
    await page.route("**/api/v1/purchases/pc-001", (route) =>
      route.request().method() === "GET"
        ? ok(route, contract)
        : route.fallback(),
    );
    const saves = await captureBodies(
      page,
      "**/api/v1/purchases/pc-001/production-details",
      "PUT",
      () => {
        contract.status = "READY";
        return contract;
      },
    );

    await signInAsAdmin(page, "/dashboard/purchases/pc-001?tab=production");
    await expect(page.getByText("已签订").first()).toBeVisible();
    await page.getByRole("button", { name: "录入生产资料" }).click();
    const dialog = page.getByRole("dialog", { name: "录入生产资料" });
    await dialog.getByLabel("规格").fill("合成重型箱");
    await dialog.getByLabel("箱数").fill("2");
    await dialog.getByLabel("总毛重").fill("40");
    await dialog.getByLabel("总净重").fill("38");
    await dialog.getByLabel("总体积").fill("0.2");
    await dialog.getByRole("button", { name: "保存并登记完工" }).click();

    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]).toMatchObject({
      completeProduction: true,
      items: [
        {
          id: "pi-1",
          specification: "合成重型箱",
          boxes: 2,
          grossWeight: 40,
          netWeight: 38,
          volume: 0.2,
        },
      ],
    });
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("待装柜").first()).toBeVisible();
  });

  test("步骤9：船司装箱单 PDF 上传核对并显示通过结论", async ({ page }) => {
    await routeOrder(page, { status: "PACKING" });
    // 历史请求带 ?limit=20，glob 不含查询串会漏匹配并落到通用分页回退，弹窗随即崩溃。
    await page.route(
      /\/api\/v1\/sales\/sc-001\/packing-list-checks(\?|$)/,
      (route) => ok(route, []),
    );
    const uploads: string[] = [];
    await page.route("**/api/v1/sales/sc-001/packing-list-check", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      uploads.push(route.request().headers()["content-type"] ?? "");
      return ok(
        route,
        {
          id: "check-1",
          salesContractId: "sc-001",
          salesContractFileId: "file-pl-1",
          automaticStatus: "PASSED",
          status: "PASSED",
          fieldMismatched: 0,
          itemCheckMismatched: 0,
          parserVersion: "synthetic",
          checkedAt: "2026-03-01T08:00:00.000Z",
          checkedBy: { id: "u-admin", name: "管理员" },
          file: { id: "file-pl-1", fileName: "carrier-packing.pdf" },
          comparison: {
            summary: {
              ok: true,
              manualReviewRequired: false,
              fieldTotal: 0,
              fieldMismatched: 0,
              itemCheckTotal: 0,
              itemCheckMismatched: 0,
              pdfNumberCount: 3,
              pdfTextLength: 120,
            },
            fields: [],
            items: [],
          },
        },
        201,
      );
    });

    await signInAsAdmin(page, "/dashboard/orders/sc-001");
    await page.getByRole("button", { name: "单证" }).click();
    await page.getByRole("menuitem", { name: "船司装箱单核对" }).click();
    const dialog = page.getByRole("dialog", { name: "船司装箱单核对" });
    await dialog.getByLabel("上传船司装箱单 PDF").setInputFiles({
      name: "carrier-packing.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 synthetic"),
    });

    await expect.poll(() => uploads.length).toBe(1);
    expect(uploads[0]).toContain("multipart/form-data");
    await expect(dialog.getByText("自动核对通过").first()).toBeVisible();
    await expect(page.getByText("核对通过，原 PDF 和结果已归档")).toBeVisible();
  });

  test("步骤10：已发运订单依次登记到港、完成订单", async ({ page }) => {
    const order = await routeOrder(page, { status: "SHIPPED" });
    const moves = await captureBodies(
      page,
      "**/api/v1/sales/sc-001/status",
      "PUT",
      (body) => {
        order.status = body.status as string;
        return order;
      },
    );

    await signInAsAdmin(page, "/dashboard/orders/sc-001");
    for (const [label, status] of [
      ["登记到港", "ARRIVED"],
      ["完成订单", "COMPLETED"],
    ] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("button", { name: "确认", exact: true }).click();
      await expect.poll(() => moves.length).toBe(label === "登记到港" ? 1 : 2);
      expect(moves.at(-1)).toEqual({ status });
    }
    await expect(
      page.getByRole("button", { name: "完成订单", exact: true }),
    ).toHaveCount(0);
  });

  test("步骤11：订单「单证 ▾ → 报关单草稿」按订单请求自动草稿", async ({
    page,
  }) => {
    await routeOrder(page, { status: "SHIPPED" });
    const drafts = await captureBodies(
      page,
      "**/api/v1/customs-declarations/auto-drafts",
      "POST",
      () => ({ created: 1, skipped: 0, items: [] }),
    );

    await signInAsAdmin(page, "/dashboard/orders/sc-001");
    await page.getByRole("button", { name: "单证" }).click();
    await page.getByRole("menuitem", { name: "报关单草稿" }).click();

    await expect.poll(() => drafts.length).toBe(1);
    expect(drafts[0]).toEqual({ salesContractId: "sc-001" });
    await expect(
      page.getByText("报关单草稿：新增 1 条，跳过 0 条"),
    ).toBeVisible();
  });

  test("步骤12：退税工作台「发票」打开逐票核验结果（只读）", async ({
    page,
  }) => {
    let verified = 0;
    // helpers 的通用夹具已含此路由；这里只数请求，并保证走的是工作台的按合同核验接口。
    await page.route(
      "**/api/v1/tax-refunds/workbench/sc-001/invoice-verification",
      (route) => {
        verified++;
        return route.fallback();
      },
    );

    await signInAsAdmin(page, "/dashboard/customs?view=workbench");
    await page.getByRole("button", { name: "发票", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "发票一致性核验" });

    await expect(dialog.getByText("00000000000000000001")).toBeVisible();
    await expect(dialog.getByText("通过").first()).toBeVisible();
    expect(verified).toBe(1);
  });

  test("步骤12：退税工作台打开清单并按当前版本确认，生成清单下载", async ({
    page,
  }) => {
    const preparation = {
      salesContractId: "sc-001",
      contractNo: "EXP2600001",
      shipmentKey: "sc-001",
      customsDeclarationId: "cd-1",
      declarationNo: "CD-E2E-001",
      materialReady: true,
      materialBlockers: [] as string[],
      sourceVersion: "a".repeat(64),
      confirmationStatus: "PENDING",
      confirmedFile: null as null | { id: string; fileName: string },
      declarations: [{ id: "cd-1", declarationNo: "CD-E2E-001" }],
      preparationReady: true,
      collectionReady: true,
      checklist: [],
      blockers: [],
      warnings: [],
      invoiceLinks: [],
      deadlines: {
        basisDate: "2026-03-01",
        internalPrepareOn: "2026-04-05",
        primaryFilingEnd: "2027-04-30",
        supplementaryWindowEnd: "2029-03-01",
        filingArchiveDueRule: "合成期限展示",
        retentionYears: 5,
      },
      officialRules: {
        effectiveFrom: "2026-01-01",
        policyDocument: "合成规则展示",
        managementDocument: "合成管理规则",
        filingRule: "仅用于界面验收",
        externalTradeMaterials: "材料核对",
        filingArchiveRule: "材料归档",
        collectionRule: "收汇核对",
        internalReminderDisclaimer: "内部提醒为合成数据。",
        sources: {
          policy: "https://example.invalid",
          management: "https://example.invalid",
          interpretation: "https://example.invalid",
        },
      },
      disclaimer: "合成验收内容，不用于实际申报。",
    };
    await page.route(
      "**/api/v1/tax-refunds/workbench/sc-001/preparation**",
      (route) => ok(route, preparation),
    );
    const file = { id: "file-list-1", fileName: "refund-list.xlsx" };
    const confirms = await captureBodies(
      page,
      "**/api/v1/tax-refunds/workbench/sc-001/confirm",
      "POST",
      () => {
        preparation.confirmationStatus = "CONFIRMED";
        return { file, preparation };
      },
    );
    let downloads = 0;
    await page.route(`**/api/v1/files/${file.id}/download`, (route) => {
      downloads++;
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        headers: {
          "Content-Disposition": `attachment; filename=${file.fileName}`,
        },
        body: "synthetic",
      });
    });

    await signInAsAdmin(page, "/dashboard/customs?view=workbench");
    await page.getByRole("button", { name: "清单", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "出口退税材料准备" });
    await dialog.getByRole("button", { name: "确认并生成清单" }).click();

    await expect.poll(() => confirms.length).toBe(1);
    expect(confirms[0]).toEqual({
      customsDeclarationId: "cd-1",
      sourceVersion: preparation.sourceVersion,
    });
    await expect.poll(() => downloads).toBe(1);
    await expect(dialog.getByText("本次资料已确认并归档。")).toBeVisible();
  });
});
