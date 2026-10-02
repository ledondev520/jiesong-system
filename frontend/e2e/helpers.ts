/**
 * Input: Playwright 页面与业务服务 DTO
 * Output: 合成 API 夹具、认证会话与页面异常断言
 * Pos: 浏览器验收共用辅助；注册仅申请审核，采购汇总遵循 receipts DTO
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, type Page, type Route } from '@playwright/test';
import type { PurchaseReceiptList } from '../src/services/purchaseReceipt.service';

const now = '2026-03-01T08:00:00.000Z';

export const mockUser = {
  id: 'u-admin',
  username: 'admin',
  name: '管理员',
  role: 'ADMIN',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const mockToken = 'e2e-mock-token';

type JsonRecord = Record<string, unknown>;

interface MockState {
  systemConfigs: JsonRecord;
  notifications: Array<{
    id: string;
    userId: string;
    type: string;
    title: string;
    content: string;
    isRead: boolean;
    metadata?: string | null;
    createdAt: string;
  }>;
  systemLogs: Array<{
    id: string;
    userId: string;
    action: string;
    entity: string;
    entityId?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: string;
    user?: { id: string; name: string; username: string };
  }>;
  importRecords: Array<{
    id: string;
    fileName: string;
    totalRows: number;
    successRows: number;
    failedRows: number;
    status: string;
    errorLog?: string | null;
    importedAt: string;
    importedBy: string;
  }>;
  inventory: Array<{
    id: string;
    quantity: number;
    status: string;
    product?: { id: string; customsName: string; unit: string };
    purchaseItem?: { purchaseContract?: { contractNo: string } };
    salesContractId?: string | null;
  }>;
}

const buildPagination = (total: number, page = 1, pageSize = 100) => ({
  total,
  page,
  pageSize,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

const asPaginated = <T>(items: T[], page = 1, pageSize = 100) => ({
  items,
  pagination: buildPagination(items.length, page, pageSize),
});

const getPathname = (url: string) => new URL(url).pathname;

const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseJsonBody = (route: Route): JsonRecord => {
  try {
    const json = route.request().postDataJSON();
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json as JsonRecord;
    }
  } catch {
    // noop
  }
  return {};
};

const createInitialState = (): MockState => ({
  systemConfigs: {
    exchangeRate: 7.2,
    profitRate: 1.3,
    units: ['个', '箱', '件'],
    brokers: ['捷淞', '埋单'],
  },
  notifications: [
    {
      id: 'n-1',
      userId: mockUser.id,
      type: 'SYSTEM',
      title: '系统维护通知',
      content: '今晚 22:00 进行系统维护。',
      isRead: false,
      metadata: null,
      createdAt: now,
    },
    {
      id: 'n-2',
      userId: mockUser.id,
      type: 'IMPORT',
      title: '导入完成',
      content: 'CSV 导入任务已完成。',
      isRead: true,
      metadata: null,
      createdAt: now,
    },
  ],
  systemLogs: [
    {
      id: 'log-1',
      userId: mockUser.id,
      action: 'IMPORT_DATA',
      entity: 'import_record',
      entityId: 'imp-1',
      oldValue: null,
      newValue: '{"status":"COMPLETED"}',
      ipAddress: '127.0.0.1',
      userAgent: 'playwright',
      createdAt: now,
      user: { id: mockUser.id, name: mockUser.name, username: mockUser.username },
    },
    {
      id: 'log-2',
      userId: mockUser.id,
      action: 'UPDATE_PRODUCT',
      entity: 'product',
      entityId: 'p-1',
      oldValue: '{"name":"旧商品"}',
      newValue: '{"name":"新商品"}',
      ipAddress: '127.0.0.1',
      userAgent: 'playwright',
      createdAt: now,
      user: { id: mockUser.id, name: mockUser.name, username: mockUser.username },
    },
  ],
  importRecords: [
    {
      id: 'imp-1',
      fileName: 'import-success.csv',
      totalRows: 100,
      successRows: 100,
      failedRows: 0,
      status: 'COMPLETED',
      errorLog: null,
      importedAt: now,
      importedBy: mockUser.name,
    },
    {
      id: 'imp-2',
      fileName: 'import-failed.csv',
      totalRows: 20,
      successRows: 16,
      failedRows: 4,
      status: 'FAILED',
      errorLog: JSON.stringify([{ row: 7, reason: '供应商缺失' }]),
      importedAt: now,
      importedBy: mockUser.name,
    },
  ],
  inventory: [
    {
      id: 'inv-1',
      quantity: 80,
      status: 'INBOUND',
      product: { id: 'p-1', customsName: '不锈钢门', unit: '扇' },
      purchaseItem: { purchaseContract: { contractNo: 'CG2600001' } },
      salesContractId: 'sc-001',
    },
  ],
});

const fulfillJson = async (route: Route, data: unknown, message = 'ok', status = 200) => {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ code: 200, message, data }),
  });
};

export const mockApiRoutes = async (page: Page) => {
  const state = createInitialState();

  const products = [
    {
      id: 'p-1',
      customsName: '不锈钢门',
      category: '餐厅设备',
      subCategory: '门',
      specification: '900x2100',
      unit: '扇',
      unitPrice: 100,
      dimensions: { length: 0.9, width: 0.05, height: 2.1 },
    },
  ];

  const suppliers = [
    {
      id: 's-1',
      name: '供应商A',
      shortName: 'A厂',
      hasQualityIssue: false,
      aliases: ['A Factory'],
    },
  ];

  const stores = [
    {
      id: 'st-1',
      name: '洛杉矶店',
      code: 'LA01',
      portId: 'port-1',
      port: { id: 'port-1', name: '洛杉矶港' },
    },
  ];

  const purchaseContract = {
    id: 'pc-001',
    contractNo: 'CG2600001',
    status: 'SIGNED',
    signedAt: '2026-02-01T00:00:00.000Z',
    supplier: suppliers[0],
    storeName: stores[0].name,
    totalAmount: 120000,
    paidAmount: 30000,
    items: [
      {
        id: 'pi-1',
        product: products[0],
        quantity: 120,
        unitPrice: 1000,
      },
    ],
  };

  // 与真实 receipts DTO 对齐，不能使用未知接口的空分页回退冒充验货汇总。
  const purchaseReceipts: PurchaseReceiptList = {
    ...asPaginated([], 1, 20),
    status: purchaseContract.status,
    summary: {
      legacy: false,
      complete: false,
      canReceive: false,
      totals: { orderedQuantity: 120, arrivedQuantity: 0, acceptedQuantity: 0, pendingQuantity: 0, reinspectionQuantity: 0 },
      items: purchaseContract.items.map((item) => ({
        purchaseItemId: item.id,
        productId: item.product.id,
        productName: item.product.customsName,
        unit: item.product.unit,
        orderedQuantity: item.quantity,
        arrivedQuantity: 0,
        acceptedQuantity: 0,
        pendingQuantity: 0,
        reinspectionQuantity: 0,
        remainingQuantity: item.quantity,
      })),
    },
  };

  const salesContract = {
    id: 'sc-001',
    contractNo: 'EXP2600001',
    status: 'DRAFT',
    signedAt: '2026-02-10T00:00:00.000Z',
    port: { id: 'port-1', name: '洛杉矶港' },
    totalAmount: 220000,
    receivedAmount: 50000,
    exchangeRate: 7.2,
    totalBoxes: 20,
    grossWeight: 15000,
    netWeight: 14000,
    volume: 32.5,
    items: [{ id: 'si-1', store: stores[0] }],
    packingItems: [
      {
        id: 'pk-1',
        productId: 'p-1',
        product: products[0],
        quantity: 40,
        unitPrice: 1100,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const containers = [
    {
      id: 'ct-1',
      containerNo: 'C2026030001',
      contractNo: 'EXP2600001',
      status: 'PENDING',
      destinationPort: '洛杉矶港',
      totalBoxes: 20,
      totalVolume: 32.5,
      eta: '2026-03-20T00:00:00.000Z',
    },
  ];

  const payables = [
    {
      id: purchaseContract.id,
      contractNo: purchaseContract.contractNo,
      totalAmount: purchaseContract.totalAmount,
      paidAmount: purchaseContract.paidAmount,
      unpaidAmount: purchaseContract.totalAmount - purchaseContract.paidAmount,
      status: purchaseContract.status,
      supplier: purchaseContract.supplier,
    },
  ];

  const receivables = [
    {
      id: salesContract.id,
      contractNo: salesContract.contractNo,
      totalAmount: salesContract.totalAmount,
      receivedAmount: salesContract.receivedAmount,
      unreceiveAmount: salesContract.totalAmount - salesContract.receivedAmount,
      exchangeRate: salesContract.exchangeRate,
      status: salesContract.status,
      items: [{ store: stores[0] }],
    },
  ];

  const importPreview = {
    fileName: 'import-demo.csv',
    analysis: {
      totalRows: 2,
      seqRange: { min: 1, max: 2 },
      missingSeqs: [],
      uniqueSeqs: 2,
    },
    comparison: {
      summary: { total: 2, new: 1, existing: 1, invalid: 0 },
      newRecords: [
        {
          seq: '2',
          customsName: '不锈钢门',
          storeName: '洛杉矶店',
          containerNo: 'C2026030001',
          quantity: 20,
          data: { seq: '2', customsName: '不锈钢门' },
        },
      ],
      existingRecords: [
        {
          seq: '1',
          customsName: '不锈钢门',
          containerNo: 'C2026030001',
          data: { seq: '1', customsName: '不锈钢门' },
        },
      ],
      invalidRecords: [],
    },
    fullNewRecords: [
      {
        seq: '2',
        customsName: '不锈钢门',
        storeName: '洛杉矶店',
        containerNo: 'C2026030001',
        quantity: 20,
        data: { seq: '2', customsName: '不锈钢门' },
      },
    ],
  };

  const importStats = {
    suppliers: 1,
    products: 1,
    stores: 1,
    containers: 1,
    containerItems: 1,
    salesContracts: 1,
    purchaseContracts: 1,
    inventories: 1,
  };

  // 合成验收数据：仅用于本地移动端流程，不来自业务数据库或文件。
  const customsDeclaration = {
    id: 'cd-1', declarationNo: 'CUS-E2E-001', status: 'RELEASED',
    salesContractId: salesContract.id, exporter: '验收出口企业', consignee: '验收海外门店',
    destinationCountry: '美国', portOfLoading: '上海', portOfDestination: '洛杉矶', transportMode: 'SEA',
    declarationDate: '2026-03-01', releaseDate: '2026-03-04', currency: 'USD',
    totalAmount: 22000, totalPackages: 20, grossWeight: 15000, netWeight: 14000,
    remarks: '合成记录：已放行，等待运输安排。',
    items: [{ id: 'cdi-1', productName: '验收用不锈钢门及配套五金组件', hsCode: '73083000', quantity: 20, unit: '扇', unitPrice: 1100, totalPrice: 22000 }],
    createdAt: now, updatedAt: now,
  };
  const taxRefund = {
    id: 'tr-1', refundNo: 'TR-E2E-001', status: 'APPLIED', salesContractId: salesContract.id,
    customsDeclarationId: customsDeclaration.id, declaredAmount: 10000, refundableAmount: 1300,
    refundedAmount: 0, appliedAt: '2026-03-05', receivedAt: null, refundRate: 13,
    matchStatus: 'MATCHED', note: '合成验收退税记录，待跟进审批。', createdAt: now, updatedAt: now,
  };
  const invoiceSummary = { shipmentRows: 1, uniqueInvoices: 1, found: 1, pass: 1, review: 0, missing: 0, invalidInvoiceNumber: 0 };
  const workbenchItem = {
    salesContractId: salesContract.id, contractNo: salesContract.contractNo, shippedAt: now,
    customsBroker: '验收报关行', contractStatus: 'SHIPPED', stage: 'READY_TO_EXPORT', ready: true,
    declaration: customsDeclaration, taxRefund, purchaseContractNos: [purchaseContract.contractNo],
    invoiceSummary, estimatedRefundableAmount: 1300, issues: [],
  };
  const hsCode = {
    id: 'hs-1', hsCode: '73083000', productName: '验收用铁或钢制门窗及其框架、门槛',
    unit: '千克', refundRate: 13, vatRate: 13, taxRate: 0, exportTaxRate: 0,
    supervisionConditions: 'A:入境货物通关单 | B:出境货物通关单',
    inspectionQuarantine: 'M:进口商品检验 | N:出口商品检验',
    declarationElements: '品牌类型|出口享惠情况|用途|材质|品牌|型号',
    effectiveDate: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://example.invalid/e2e-tariff',
    note: '合成税则记录，不用于实际申报。', similarity: 0.95,
  };
  const balanceSheet = {
    id: 'bs-e2e', periodId: 'period-2026-03', cashAndEquivalents: 80000, shortTermInvestments: 0,
    accountsReceivable: 170000, prepaidExpenses: 10000, otherReceivables: 10000, inventory: 130000,
    totalCurrentAssets: 400000, totalNonCurrentAssets: 100000, totalAssets: 500000,
    accountsPayable: 90000, advancedReceipts: 50000, staffWagesPayable: 10000, taxesPayable: 10000,
    otherPayables: 10000, totalCurrentLiabilities: 170000, totalNonCurrentLiabilities: 30000,
    totalLiabilities: 200000, paidInCapital: 200000, capitalReserve: 0, surplusReserve: 0,
    retainedEarnings: 100000, totalEquity: 300000,
  };
  const incomeStatement = {
    id: 'is-e2e', periodId: 'period-2026-03', revenueMonth: 220000, costOfSalesMonth: 120000,
    taxesMonth: 0, sellingExpensesMonth: 5000, adminExpensesMonth: 10000, financialExpensesMonth: 3000,
    investmentIncomeMonth: 0, operatingProfitMonth: 82000, nonOperatingIncomeMonth: 0,
    nonOperatingExpensesMonth: 0, totalProfitMonth: 82000, incomeTaxMonth: 12000, netProfitMonth: 70000,
    revenueYTD: 220000, costOfSalesYTD: 120000, taxesYTD: 0, sellingExpensesYTD: 5000,
    adminExpensesYTD: 10000, financialExpensesYTD: 3000, investmentIncomeYTD: 0,
    operatingProfitYTD: 82000, nonOperatingIncomeYTD: 0, nonOperatingExpensesYTD: 0,
    totalProfitYTD: 82000, incomeTaxYTD: 12000, netProfitYTD: 70000,
  };
  const financialPeriod = {
    id: 'period-2026-03', year: 2026, month: 3, periodLabel: '2026年3月账期', reportDate: now, importedAt: now,
    balanceSheet, incomeStatement, cashFlowStatement: null,
    accountBalances: [{ id: 'ab-e2e', sourceRow: 2, rowType: 'ACCOUNT', accountCode: '1002', accountName: '银行存款', openingDebit: 70000, openingCredit: 0, periodDebit: 30000, periodCredit: 20000, yearDebit: 30000, yearCredit: 20000, endingDebit: 80000, endingCredit: 0 }],
    generalLedgerEntries: [{ id: 'gl-e2e', sourceRow: 2, rowType: 'ENTRY', accountCode: '1002', accountName: '银行存款', entryDate: '2026-03-01', voucherNumber: 'E2E-1', summary: '合成验收记录', debit: 30000, credit: null, direction: '借', balance: 100000 }],
    dataSources: [{ id: 'fs-e2e', type: 'STATEMENT', fileName: 'e2e-synthetic-statements.xlsx', fileSize: 1024, sha256: 'e'.repeat(64), sheetName: '合成报表', rowCount: 1, importedAt: now }],
  };
  const bankTransaction = {
    id: 'bank-e2e-1', batchId: 'batch-bank-e2e', bankName: '合成验收银行', accountNoMasked: '****0000', currency: 'CNY',
    txnTime: now, txnDate: '2026-03-01', amount: 10000, payer: '验收付款企业', payee: '验收供应商',
    summary: '合成验收材料付款，用于检查手机卡片和对账匹配', txnType: '转账', txnId: 'E2E-TXN-0001',
    balance: 80000, counterpart: '验收供应商', direction: 'OUT',
    matchedContractId: null, matchedContractType: null, matchScore: null, matchStatus: 'PENDING', matchedAt: null,
  };
  const invoiceRecord = {
    id: 'invoice-e2e-1', batchId: 'batch-invoice-e2e', invNo: '00000000000000000001', seller: '验收供应商', buyer: '验收采购企业',
    invDate: '2026-03-01', itemName: '验收用不锈钢门及配套五金组件', spec: '900x2100', unit: '扇', qty: 10,
    amount: 8849.56, taxRate: '13%', tax: 1150.44, total: 10000, invoiceType: '增值税专用发票', status: '正常',
    isPositive: '是', riskLevel: null, matchedContractId: null, matchedContractType: null, matchScore: null, matchStatus: 'PENDING', matchedAt: null,
  };

  const evidenceDocument = {
    id: 'ev-e2e', fileName: 'e2e-synthetic-evidence.xlsx', relativePath: 'e2e/synthetic',
    category: 'ACCOUNTING_STATEMENT', categoryLabel: '合成会计资料', analysisScope: '仅用于界面验收',
    periodYear: 2026, periodMonth: 3, importedSheetCount: 1, rowCount: 1,
    numericCellCount: 1, textCellCount: 1, redactionCount: 0, originalArchived: false, importedAt: now,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = getPathname(request.url());
    const method = request.method().toUpperCase();
    const searchParams = new URL(request.url()).searchParams;

    if (!pathname.startsWith('/api/v1/')) {
      await fulfillJson(route, null);
      return;
    }

    if (/^\/api\/v1\/system\/export\/[^/]+$/.test(pathname) && method === 'GET') {
      const exportType = pathname.split('/').pop() || 'data';
      await route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${exportType}.csv`)}`,
        },
        body: `id,name\n1,${exportType}\n`,
      });
      return;
    }

    if (/^\/api\/v1\/sales\/[^/]+\/export-excel$/.test(pathname) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: {
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('EXP2600001_出口模板.xlsx')}`,
        },
        body: 'mock-excel-content',
      });
      return;
    }

    if (pathname === '/api/v1/ai/greeting' && method === 'GET') {
      await fulfillJson(route, {
        greeting: '欢迎回来，今天也要稳步推进。',
        songName: '倔强',
        lyrics: ['当我和世界不一样', '那就让我不一样'],
        source: 'local',
      });
      return;
    }

    if (pathname === '/api/v1/auth/login' && method === 'POST') {
      await fulfillJson(route, {
        user: mockUser,
        token: mockToken,
      });
      return;
    }

    if (pathname === '/api/v1/auth/email-code' && method === 'POST') {
      await fulfillJson(route, { cooldownSeconds: 60 });
      return;
    }

    if (pathname === '/api/v1/auth/email-register' && method === 'POST') {
      // 合成注册结果只表示待审核，不能返回登录令牌或已开通权限。
      await fulfillJson(route, { pendingApproval: true });
      return;
    }

    if (pathname === '/api/v1/dashboard/wps-sync' && method === 'GET') {
      await fulfillJson(route, { state: 'current', lastSuccessAt: now, lastAttemptAt: now, conflicts: 0 });
      return;
    }

    if (pathname === '/api/v1/dashboard/trade-workflows' && method === 'GET') {
      const labels = ['采购准备', '采购签订', '生产跟进', '入库验收', '出口装箱', '报关出运', '出口退税', '财务结清'];
      await fulfillJson(route, [{
        id: salesContract.id, contractNo: salesContract.contractNo, status: 'DRAFT',
        purchaseContractNos: [purchaseContract.contractNo], completedStageCount: 2, stageCount: 8,
        stages: labels.map((label, index) => ({ key: `stage-${index}`, label,
          status: index < 2 ? 'completed' : index === 2 ? 'current' : 'pending',
          reason: index === 2 ? '核对生产进度后安排到货验收。' : '按业务进度完成此阶段。' })),
        nextAction: { label: '查看生产进度', href: '/dashboard/purchase/pc-001' }, issues: [],
      }]);
      return;
    }

    if (pathname === '/api/v1/dashboard/analytics' && method === 'GET') {
      await fulfillJson(route, {
        contracts: {
          purchase: { count: 1, totalAmount: 120000, paidAmount: 30000, unpaidAmount: 90000 },
          sales: { count: 1, totalAmount: 220000, receivedAmount: 50000, receivable: 170000 },
        },
        inventory: { productCount: 1, recordCount: state.inventory.length, totalQuantity: 80 },
        shipments: {
          monthly: [
            { month: '2025-11', count: 1, amount: 60000, boxes: 8 },
            { month: '2025-12', count: 1, amount: 70000, boxes: 9 },
            { month: '2026-01', count: 1, amount: 90000, boxes: 12 },
          ],
        },
        topProducts: [{ productName: '不锈钢门', count: 3, quantity: 80, totalAmount: 90000 }],
        storeStats: [{ storeName: '洛杉矶店', orderCount: 3, quantity: 80, totalAmount: 90000 }],
      });
      return;
    }

    if (pathname === '/api/v1/dashboard/track-product' && method === 'GET') {
      await fulfillJson(route, [
        {
          salesContractId: salesContract.id,
          contractNo: salesContract.contractNo,
          portName: salesContract.port.name,
          status: salesContract.status,
          eta: '2026-03-20',
          storeName: stores[0].name,
          productName: products[0].customsName,
          quantity: 40,
        },
      ]);
      return;
    }

    if (pathname === '/api/v1/dashboard/stats' && method === 'GET') {
      await fulfillJson(route, {
        overview: {
          purchaseContracts: 1,
          salesContracts: 1,
          products: 1,
          containers: 1,
        },
      });
      return;
    }

    if (pathname === '/api/v1/reports/business-overview' && method === 'GET') {
      await fulfillJson(route, {
        overview: {
          totalSales: 220000,
          totalPurchases: 120000,
          grossProfit: 100000,
          profitMargin: 0.45,
        },
        funds: {
          totalReceivable: 170000,
          totalPayable: 90000,
          overdueReceivable: 25000,
          overduePayable: 15000,
        },
        inventory: {
          totalItems: 80,
          lowStockItems: 1,
          inTransitContainers: 1,
        },
        trends: {
          monthlySales: [
            { month: '2026-01', amount: 90000 },
            { month: '2026-02', amount: 120000 },
            { month: '2026-03', amount: 220000 },
          ],
        },
      });
      return;
    }

    if (pathname === '/api/v1/tax-refunds/workbench' && method === 'GET') {
      const stage = searchParams.get('stage');
      const keyword = searchParams.get('keyword') || '';
      const items = (!stage || stage === 'ALL' || stage === workbenchItem.stage) && (!keyword || workbenchItem.contractNo.includes(keyword)) ? [workbenchItem] : [];
      await fulfillJson(route, {
        items, total: items.length, page: 1, pageSize: 100,
        summary: { contracts: 1, readyToExport: 1, needsReview: 0, missingInvoices: 0, draftCount: 1, submittedCount: 0, estimatedRefundableAmount: 1300, latestInvoiceBatch: null },
        disclaimer: '合成验收数据，仅用于内部准备界面。',
      });
      return;
    }

    if (/^\/api\/v1\/tax-refunds\/workbench\/[^/]+\/invoice-verification$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, {
        salesContractId: salesContract.id, contractNo: salesContract.contractNo, summary: invoiceSummary,
        results: [{ status: 'PASS', sourceRows: [2], contracts: [purchaseContract.contractNo], invoiceNo: '00000000000000000001', invoiceNumberValid: true, expectedSellers: ['验收供应商'], expectedItems: ['验收不锈钢门'], expectedTotal: 10000, found: true, actualSeller: '验收供应商', actualDate: '2026-03-01', actualItems: '验收不锈钢门', actualTotal: 10000, issues: [] }],
      });
      return;
    }

    if (/^\/api\/v1\/sales\/[^/]+\/tax-refund-preparation$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, {
        salesContractId: salesContract.id, contractNo: salesContract.contractNo, preparationReady: true, collectionReady: true,
        checklist: [{ id: 'check-e2e', label: '报关与发票材料', category: '申报凭证', requirement: 'required', status: 'ready', evidence: '合成验收记录', message: '材料已齐，仅用于界面验收' }],
        blockers: [], warnings: [], invoiceLinks: [],
        deadlines: { basisDate: '2026-03-01', internalPrepareOn: '2026-04-05', primaryFilingEnd: '2027-04-30', supplementaryWindowEnd: '2029-03-01', filingArchiveDueRule: '合成期限展示', retentionYears: 5 },
        officialRules: { effectiveFrom: '2026-01-01', policyDocument: '合成规则展示', managementDocument: '合成管理规则', filingRule: '仅用于界面验收', externalTradeMaterials: '材料核对', filingArchiveRule: '材料归档', collectionRule: '收汇核对', internalReminderDisclaimer: '内部提醒为合成数据。', sources: { policy: 'https://example.invalid', management: 'https://example.invalid', interpretation: 'https://example.invalid' } },
        disclaimer: '合成验收内容，不用于实际申报。',
      });
      return;
    }

    if ((pathname === '/api/v1/customs-declarations/auto-drafts' || pathname === '/api/v1/tax-refunds/auto-drafts') && method === 'POST') {
      await fulfillJson(route, { created: 0, skipped: 1 });
      return;
    }

    if (pathname === '/api/v1/tax-refunds/export' && method === 'POST') {
      await route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', headers: { 'Content-Disposition': 'attachment; filename=e2e-tax-refunds.csv' }, body: 'refundNo,amount\nTR-E2E-001,1300\n' });
      return;
    }

    if ((pathname === '/api/v1/customs-declarations' || pathname === '/api/v1/tax-refunds') && method === 'GET') {
      const item = pathname.endsWith('/tax-refunds') ? taxRefund : customsDeclaration;
      const status = searchParams.get('status');
      const keyword = searchParams.get('keyword') || '';
      const items = (!status || status === 'ALL' || item.status === status) && (!keyword || JSON.stringify(item).includes(keyword)) ? [item] : [];
      await fulfillJson(route, asPaginated(items, Number(searchParams.get('page') || 1), Number(searchParams.get('pageSize') || 20)));
      return;
    }

    if (/^\/api\/v1\/(customs-declarations|tax-refunds)\/[^/]+$/.test(pathname) && (method === 'GET' || method === 'PUT')) {
      const item = pathname.includes('/tax-refunds/') ? taxRefund : customsDeclaration;
      await fulfillJson(route, method === 'PUT' ? { ...item, ...parseJsonBody(route) } : item);
      return;
    }

    if ((pathname === '/api/v1/customs-declarations' || pathname === '/api/v1/tax-refunds') && method === 'POST') {
      await fulfillJson(route, { ...(pathname.endsWith('/tax-refunds') ? taxRefund : customsDeclaration), ...parseJsonBody(route) });
      return;
    }

    if (pathname === '/api/v1/hs-codes' && method === 'GET') {
      const keyword = searchParams.get('keyword') || '';
      const code = searchParams.get('code') || '';
      const items = (!keyword || hsCode.productName.includes(keyword)) && (!code || hsCode.hsCode.startsWith(code)) ? [hsCode] : [];
      await fulfillJson(route, asPaginated(items, Number(searchParams.get('page') || 1), Number(searchParams.get('pageSize') || 20)));
      return;
    }

    if (pathname === '/api/v1/hs-codes/search' && method === 'GET') {
      await fulfillJson(route, [hsCode]);
      return;
    }

    if (/^\/api\/v1\/hs-codes\/[^/]+$/.test(pathname) && (method === 'GET' || method === 'PUT')) {
      await fulfillJson(route, method === 'PUT' ? { ...hsCode, ...parseJsonBody(route) } : hsCode);
      return;
    }

    if (pathname === '/api/v1/finance/statements/evidence/summary' && method === 'GET') {
      await fulfillJson(route, {
        totals: { documentCount: 1, sheetCount: 1, rowCount: 1, redactionCount: 0 },
        categories: [{ category: evidenceDocument.category, categoryLabel: evidenceDocument.categoryLabel, analysisScope: evidenceDocument.analysisScope, documentCount: 1, sheetCount: 1, rowCount: 1, redactionCount: 0 }],
        periods: ['2026-03'], latestImportedAt: now,
      });
      return;
    }

    if (pathname === '/api/v1/finance/statements/evidence/documents' && method === 'GET') {
      await fulfillJson(route, { items: [evidenceDocument], ...buildPagination(1, 1, 20) });
      return;
    }

    if (/^\/api\/v1\/finance\/statements\/evidence\/documents\/[^/]+$/.test(pathname) && method === 'GET') {
      const sheet = { id: 'sheet-e2e', sheetIndex: 0, sheetName: '合成验收资料', sourceRange: 'A1:B1', rowCount: 1, columnCount: 2, redactionCount: 0 };
      await fulfillJson(route, { ...evidenceDocument, sheets: [sheet], selectedSheet: sheet, rows: [{ id: 'row-e2e', sourceRow: 1, rowKind: 'DATA', values: ['合成验收记录', 100], numericCellCount: 1, textCellCount: 1, redactionCount: 0 }], pagination: buildPagination(1, 1, 50) });
      return;
    }

    if (pathname === '/api/v1/finance/receivable-reconciliation' && method === 'GET') {
      await fulfillJson(route, { period: { year: 2026, month: 3, label: '2026年3月账期' }, cutoffDate: '2026-03-31', contractCount: 1, formalSalesUsd: 22000, receivedUsd: 5000, operatingReceivableUsd: 17000, reportedReceivableCny: 122400, effectiveExchangeRate: 7.2, translatedOperatingReceivableCny: 122400, correctedAccountingReceivableCny: 122400, residualCny: 0, anomalies: { duplicateDebitCny: 0, duplicateContracts: [], missingDebitCny: 0, missingContracts: [] }, assumptions: ['合成验收数据'] });
      return;
    }

    if (pathname === '/api/v1/products' && method === 'GET') {
      await fulfillJson(route, asPaginated(products));
      return;
    }

    if (/^\/api\/v1\/products\/[^/]+$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, products[0]);
      return;
    }

    if (pathname === '/api/v1/suppliers' && method === 'GET') {
      await fulfillJson(route, asPaginated(suppliers));
      return;
    }

    if (pathname === '/api/v1/stores' && method === 'GET') {
      await fulfillJson(route, asPaginated(stores));
      return;
    }

    if (pathname === '/api/v1/users' && method === 'GET') {
      await fulfillJson(route, asPaginated([mockUser]));
      return;
    }

    if (pathname === '/api/v1/containers' && method === 'GET') {
      await fulfillJson(route, asPaginated(containers));
      return;
    }

    if (pathname === '/api/v1/purchases/options/next-no' && method === 'GET') {
      await fulfillJson(route, { contractNo: 'CG2600002' });
      return;
    }

    if (pathname === '/api/v1/purchases/suppliers-by-products' && method === 'POST') {
      await fulfillJson(route, { supplierIds: [suppliers[0].id] });
      return;
    }

    if (pathname === '/api/v1/purchases' && method === 'GET') {
      const supplierId = searchParams.get('supplierId');
      const list = supplierId ? [{ totalAmount: purchaseContract.totalAmount }] : [purchaseContract];
      await fulfillJson(route, {
        ...asPaginated(list),
        total: list.length,
      });
      return;
    }

    if (/^\/api\/v1\/purchases\/[^/]+$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, purchaseContract);
      return;
    }

    if (/^\/api\/v1\/purchases\/[^/]+\/receipts$/.test(pathname) && method === 'GET') {
      const pageNumber = Number(searchParams.get('page') || 1);
      const pageSize = Number(searchParams.get('pageSize') || 20);
      await fulfillJson(route, { ...purchaseReceipts, pagination: buildPagination(0, pageNumber, pageSize) });
      return;
    }

    if (pathname === '/api/v1/ai/parse' && method === 'POST') {
      await fulfillJson(route, {
        items: [],
        unresolvedRows: [],
      });
      return;
    }

    if (pathname === '/api/v1/ai/sessions' && method === 'GET') {
      await fulfillJson(route, [
        {
          sessionId: 'session-1',
          _max: { createdAt: now },
          _count: { _all: 4 },
        },
      ]);
      return;
    }

    if (/^\/api\/v1\/ai\/sessions\/[^/]+$/.test(pathname) && method === 'DELETE') {
      await fulfillJson(route, null);
      return;
    }

    if (pathname === '/api/v1/ai/token-stats' && method === 'GET') {
      await fulfillJson(route, {
        period: '30d',
        totalRequests: 12,
        totalTokens: 34567,
        promptTokens: 21000,
        outputTokens: 13567,
        byModel: [
          { model: 'gpt-4.1-mini', requests: 8, tokens: 22000 },
          { model: 'gpt-4.1', requests: 4, tokens: 12567 },
        ],
        daily: [
          { day: '2026-03-20', model: 'gpt-4.1-mini', tokens: 8200, requests: 3, successRate: 1 },
          { day: '2026-03-21', model: 'gpt-4.1-mini', tokens: 7400, requests: 2, successRate: 1 },
          { day: '2026-03-22', model: 'gpt-4.1', tokens: 9100, requests: 4, successRate: 1 },
          { day: '2026-03-23', model: 'gpt-4.1-mini', tokens: 9867, requests: 3, successRate: 1 },
        ],
      });
      return;
    }

    if (pathname === '/api/v1/ai/standalone-token-usage' && method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'standalone-1',
          model: 'gpt-4.1-mini',
          promptTokens: 800,
          outputTokens: 200,
          totalTokens: 1000,
          requestType: 'hs_code_recommend',
          detailSnapshot: 'HS 编码推荐结果',
          createdAt: now,
        },
      ]);
      return;
    }

    if (pathname === '/api/v1/ai/history' && method === 'GET') {
      await fulfillJson(route, asPaginated([
        {
          id: 'msg-1',
          role: 'user',
          content: '帮我总结最近的 AI 调用情况',
          createdAt: now,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '最近 7 天主要使用 gpt-4.1-mini 处理日常问题。',
          modelUsed: 'gpt-4.1-mini',
          createdAt: now,
        },
      ]));
      return;
    }

    if (pathname === '/api/v1/ai/models' && method === 'GET') {
      await fulfillJson(route, {
        models: {
          chat: 'gpt-4.1-mini',
          analysis: 'gpt-4.1',
        },
        description: {
          chat: '日常问答与操作建议',
          analysis: '复杂数据分析与总结',
        },
      });
      return;
    }

    if (pathname === '/api/v1/import/history' && method === 'GET') {
      const status = searchParams.get('status');
      const keyword = searchParams.get('keyword')?.trim();
      const page = Number(searchParams.get('page') || '1');
      const pageSize = Number(searchParams.get('pageSize') || '20');
      const filtered = state.importRecords.filter((item) => {
        const statusMatch = !status || item.status === status;
        const keywordMatch = !keyword || item.fileName.includes(keyword);
        return statusMatch && keywordMatch;
      });
      await fulfillJson(route, asPaginated(filtered, page, pageSize));
      return;
    }

    if (pathname === '/api/v1/import/stats' && method === 'GET') {
      await fulfillJson(route, importStats);
      return;
    }

    if (pathname === '/api/v1/import/preview' && method === 'POST') {
      await fulfillJson(route, importPreview);
      return;
    }

    if (pathname === '/api/v1/import/execute' && method === 'POST') {
      await fulfillJson(route, {
        message: '导入完成',
        result: {
          success: [{ seq: '2', customsName: '不锈钢门', storeName: '洛杉矶店' }],
          failed: [],
          created: {
            suppliers: 0,
            products: 0,
            stores: 0,
            containers: 0,
            salesContracts: 0,
            purchaseContracts: 0,
            containerItems: 0,
            inventories: 1,
          },
        },
      });
      return;
    }

    if (pathname === '/api/v1/sales/options/next-no' && method === 'GET') {
      await fulfillJson(route, { contractNo: 'EXP2600002' });
      return;
    }

    if (pathname === '/api/v1/sales' && method === 'GET') {
      await fulfillJson(route, asPaginated([salesContract]));
      return;
    }

    if (/^\/api\/v1\/sales\/[^/]+$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, salesContract);
      return;
    }

    if (pathname === '/api/v1/sales' && method === 'POST') {
      await fulfillJson(route, { ...salesContract, id: 'sc-002', contractNo: 'EXP2600002' });
      return;
    }

    if (pathname === '/api/v1/inventory' && method === 'GET') {
      await fulfillJson(route, asPaginated(state.inventory));
      return;
    }

    if (/^\/api\/v1\/inventory\/[^/]+\/status$/.test(pathname) && method === 'PUT') {
      const id = pathname.split('/')[4];
      const body = parseJsonBody(route);
      const nextStatus = String(body.status || '');
      state.inventory = state.inventory.map((item) =>
        item.id === id ? { ...item, status: nextStatus || item.status } : item
      );
      await fulfillJson(route, state.inventory.find((item) => item.id === id) || null);
      return;
    }

    if (pathname === '/api/v1/inventory/batch-status' && method === 'PUT') {
      const body = parseJsonBody(route);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const nextStatus = typeof body.status === 'string' ? body.status : 'INBOUND';
      state.inventory = state.inventory.map((item) =>
        ids.includes(item.id) ? { ...item, status: nextStatus } : item
      );
      await fulfillJson(route, { success: ids.length, failed: 0, errors: [] });
      return;
    }

    if (pathname === '/api/v1/finance/stats' && method === 'GET') {
      await fulfillJson(route, {
        payable: { total: 120000, paid: 30000, unpaid: 90000 },
        receivable: { total: 220000, received: 50000, unreceived: 170000 },
      });
      return;
    }

    if (pathname === '/api/v1/finance/statements' && method === 'GET') {
      await fulfillJson(route, [financialPeriod]);
      return;
    }

    if (pathname === '/api/v1/finance/statements/analytics' && method === 'GET') {
      await fulfillJson(route, {
        trends: [
          {
            label: '2026-03',
            year: 2026,
            month: 3,
            revenue: 220000,
            costOfSales: 120000,
            adminExpenses: 10000,
            financialExpenses: 3000,
            sellingExpenses: 5000,
            operatingProfit: 82000,
            netProfit: 70000,
            totalAssets: 500000,
            totalLiabilities: 200000,
            totalEquity: 300000,
            cash: 80000,
            debtRatio: 0.4,
          },
        ],
        alerts: [],
        historicalAlerts: [],
        latestPeriod: {
          periodLabel: '2026年3月账期',
          balanceSheet,
          incomeStatement,
        },
        totalPeriods: 1,
      });
      return;
    }

    if (/^\/api\/v1\/finance\/statements\/\d{4}\/\d{1,2}$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, financialPeriod);
      return;
    }

    if (pathname === '/api/v1/finance/unmatched' && method === 'GET') {
      await fulfillJson(route, { bankItems: [bankTransaction], invoiceItems: [invoiceRecord], bankTotal: 1, invoiceTotal: 1, page: 1, pageSize: 100 });
      return;
    }

    if (pathname === '/api/v1/finance/contracts-for-match' && method === 'GET') {
      const contract = searchParams.get('contractType') === 'SALES'
        ? { ...salesContract, portId: salesContract.port.id, packingItems: [{ id: 'pk-e2e', store: stores[0] }] }
        : { ...purchaseContract, supplierId: suppliers[0].id };
      const search = searchParams.get('search') || '';
      await fulfillJson(route, !search || JSON.stringify(contract).includes(search) ? [contract] : []);
      return;
    }

    if (pathname === '/api/v1/bank-flow/transactions' && method === 'GET') {
      const search = searchParams.get('search') || '';
      const direction = searchParams.get('direction');
      const items = (!search || JSON.stringify(bankTransaction).includes(search)) && (!direction || direction === bankTransaction.direction) ? [bankTransaction] : [];
      await fulfillJson(route, asPaginated(items, 1, 20));
      return;
    }

    if (pathname === '/api/v1/bank-flow/invoices' && method === 'GET') {
      const search = searchParams.get('search') || '';
      const status = searchParams.get('status');
      const items = (!search || JSON.stringify(invoiceRecord).includes(search)) && (!status || status === invoiceRecord.status) ? [invoiceRecord] : [];
      await fulfillJson(route, asPaginated(items, 1, 20));
      return;
    }

    if (pathname === '/api/v1/bank-flow/batches' && method === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === '/api/v1/bank-flow/transactions/stats' && method === 'GET') {
      await fulfillJson(route, {
        totalIn: 220000,
        totalOut: 120000,
        netFlow: 100000,
        txnCount: 8,
      });
      return;
    }

    if (pathname === '/api/v1/bank-flow/invoices/stats' && method === 'GET') {
      await fulfillJson(route, {
        validTotal: 88000,
        validTax: 8800,
        validAmount: 79200,
        validCount: 5,
        reversedCount: 1,
        totalCount: 6,
      });
      return;
    }

    if (pathname === '/api/v1/system/exchange-rate' && method === 'GET') {
      await fulfillJson(route, {
        rate: 7.2,
        buffer: 0.2,
        effectiveRate: 7.0,
      });
      return;
    }

    if (pathname === '/api/v1/finance/payment-trends' && method === 'GET') {
      await fulfillJson(route, [
        { label: '第1周', receivables: 32000, payables: 18000 },
        { label: '第2周', receivables: 28000, payables: 22000 },
        { label: '第3周', receivables: 36000, payables: 16000 },
        { label: '第4周', receivables: 42000, payables: 24000 },
      ]);
      return;
    }

    if (pathname === '/api/v1/finance/overdue-receivables' && method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'ov-1',
          contractNo: 'EXP2600001',
          totalAmount: 220000,
          receivedAmount: 50000,
          unreceived: 170000,
          shippedAt: now,
          overdueDays: 12,
          status: 'SHIPPED',
        },
      ]);
      return;
    }

    if (pathname === '/api/v1/finance/payables' && method === 'GET') {
      await fulfillJson(route, asPaginated(payables));
      return;
    }

    if (pathname === '/api/v1/finance/receivables' && method === 'GET') {
      await fulfillJson(route, asPaginated(receivables));
      return;
    }

    if (pathname === '/api/v1/finance/payments' && method === 'POST') {
      await fulfillJson(route, { id: 'pay-1' });
      return;
    }

    if (pathname === '/api/v1/finance/unallocated-payments' && method === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === '/api/v1/finance/payments/auto-match' && method === 'POST') {
      await fulfillJson(route, {
        inspectedCount: 0,
        matchedCount: 0,
        skippedCount: 0,
        matched: [],
        skipped: [],
      });
      return;
    }

    if (pathname === '/api/v1/bank-flow/reconciliation/full' && method === 'GET') {
      await fulfillJson(route, {
        matched: [],
        unmatchedPayments: [],
        unmatchedInvoices: [],
        summary: {
          matchedCount: 0,
          normalCount: 0,
          underInvoicedCount: 0,
          underInvoicedGap: 0,
          overInvoicedCount: 0,
          overInvoicedGap: 0,
          unmatchedPaymentCount: 0,
          unmatchedPaymentTotal: 0,
          unmatchedInvoiceCount: 0,
          unmatchedInvoiceTotal: 0,
        },
      });
      return;
    }

    if (pathname === '/api/v1/bank-flow/incoming-summary' && method === 'GET') {
      await fulfillJson(route, {
        items: [],
        total: 0,
      });
      return;
    }

    if (pathname === '/api/v1/store-recommend/stats' && method === 'GET') {
      await fulfillJson(route, [
        {
          storeId: stores[0].id,
          storeName: stores[0].name,
          totalAmount: 48000,
          productCount: 12,
          categories: [
            { name: '餐厅设备', amount: 30000, count: 5 },
            { name: '餐具用品', amount: 18000, count: 7 },
          ],
        },
      ]);
      return;
    }

    if (pathname === '/api/v1/store-recommend/recommend' && method === 'POST') {
      await fulfillJson(route, {
        referenceStoreCount: 1,
        totalProducts: 2,
        totalEstimatedCost: 26000,
        recommendations: [
          {
            productId: 'p-1',
            productName: '不锈钢门',
            category: '餐厅设备',
            subCategory: '门',
            frequency: 100,
            suggestedQuantity: 2,
            avgUnitPrice: 8000,
            estimatedCost: 16000,
            priority: '强烈建议',
          },
          {
            productId: 'p-2',
            productName: '餐具套装',
            category: '餐具用品',
            subCategory: '套装',
            frequency: 65,
            suggestedQuantity: 20,
            avgUnitPrice: 500,
            estimatedCost: 10000,
            priority: '建议',
          },
        ],
        byCategory: {
          餐厅设备: [
            {
              productId: 'p-1',
              productName: '不锈钢门',
              category: '餐厅设备',
              subCategory: '门',
              frequency: 100,
              suggestedQuantity: 2,
              avgUnitPrice: 8000,
              estimatedCost: 16000,
              priority: '强烈建议',
            },
          ],
          餐具用品: [
            {
              productId: 'p-2',
              productName: '餐具套装',
              category: '餐具用品',
              subCategory: '套装',
              frequency: 65,
              suggestedQuantity: 20,
              avgUnitPrice: 500,
              estimatedCost: 10000,
              priority: '建议',
            },
          ],
        },
      });
      return;
    }

    if (pathname === '/api/v1/procurement-template/stores' && method === 'GET') {
      await fulfillJson(route, [stores[0].name, '纽约店']);
      return;
    }

    if (pathname === '/api/v1/procurement-template/universal' && method === 'GET') {
      await fulfillJson(route, {
        totalStores: 2,
        totalProducts: 3,
        mustHaveCount: 1,
        templateStore: stores[0].name,
        items: [
          {
            name: '不锈钢门',
            supplement: '主入口',
            category: '餐厅设备',
            storeCount: 2,
            frequency: 100,
            priority: '强烈建议',
            isTemplateStore: true,
            avgQtyPerStore: 2,
            unit: '扇',
            manufacturers: ['A厂'],
            totalAmount: 16000,
            rowCount: 2,
          },
          {
            name: '餐具套装',
            supplement: '基础配置',
            category: '餐具用品',
            storeCount: 2,
            frequency: 80,
            priority: '建议',
            isTemplateStore: true,
            avgQtyPerStore: 20,
            unit: '套',
            manufacturers: ['B厂'],
            totalAmount: 10000,
            rowCount: 2,
          },
        ],
        byCategory: {
          餐厅设备: [
            {
              name: '不锈钢门',
              supplement: '主入口',
              category: '餐厅设备',
              storeCount: 2,
              frequency: 100,
              priority: '强烈建议',
              isTemplateStore: true,
              avgQtyPerStore: 2,
              unit: '扇',
              manufacturers: ['A厂'],
              totalAmount: 16000,
              rowCount: 2,
            },
          ],
          餐具用品: [
            {
              name: '餐具套装',
              supplement: '基础配置',
              category: '餐具用品',
              storeCount: 2,
              frequency: 80,
              priority: '建议',
              isTemplateStore: true,
              avgQtyPerStore: 20,
              unit: '套',
              manufacturers: ['B厂'],
              totalAmount: 10000,
              rowCount: 2,
            },
          ],
        },
      });
      return;
    }

    if (/^\/api\/v1\/procurement-template\/stores\/[^/]+$/.test(pathname) && method === 'GET') {
      const storeName = decodeURIComponent(pathname.split('/').pop() || stores[0].name);
      await fulfillJson(route, {
        storeName,
        totalProducts: 2,
        totalAmount: 18000,
        items: [
          {
            name: '不锈钢门',
            supplement: '主入口',
            category: '餐厅设备',
            totalQty: 2,
            unit: '扇',
            manufacturer: 'A厂',
            spec: '900x2100',
            totalAmount: 16000,
            shipments: [
              { date: '2026-02-01', qty: 2, amount: 16000, spec: '900x2100' },
            ],
          },
          {
            name: '餐具套装',
            supplement: '基础配置',
            category: '餐具用品',
            totalQty: 20,
            unit: '套',
            manufacturer: 'B厂',
            spec: '标准款',
            totalAmount: 2000,
            shipments: [
              { date: '2026-02-03', qty: 20, amount: 2000, spec: '标准款' },
            ],
          },
        ],
        byCategory: {
          餐厅设备: [
            {
              name: '不锈钢门',
              supplement: '主入口',
              category: '餐厅设备',
              totalQty: 2,
              unit: '扇',
              manufacturer: 'A厂',
              spec: '900x2100',
              totalAmount: 16000,
              shipments: [
                { date: '2026-02-01', qty: 2, amount: 16000, spec: '900x2100' },
              ],
            },
          ],
          餐具用品: [
            {
              name: '餐具套装',
              supplement: '基础配置',
              category: '餐具用品',
              totalQty: 20,
              unit: '套',
              manufacturer: 'B厂',
              spec: '标准款',
              totalAmount: 2000,
              shipments: [
                { date: '2026-02-03', qty: 20, amount: 2000, spec: '标准款' },
              ],
            },
          ],
        },
      });
      return;
    }

    if (pathname === '/api/v1/contract-templates' && method === 'GET') {
      await fulfillJson(route, [
        {
          id: 'tpl-1',
          name: '标准采购模板',
          type: 'PURCHASE',
          supplierId: suppliers[0].id,
          taxRate: 13,
          note: 'E2E 模板',
          items: [
            {
              productId: products[0].id,
              quantity: 1,
              unitPrice: 1000,
              unit: products[0].unit,
            },
          ],
          createdBy: mockUser.id,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      return;
    }

    if (pathname === '/api/v1/contract-templates' && method === 'POST') {
      await fulfillJson(route, {
        id: 'tpl-2',
        ...parseJsonBody(route),
        createdBy: mockUser.id,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    if (pathname === '/api/v1/system/configs' && method === 'GET') {
      await fulfillJson(route, state.systemConfigs);
      return;
    }

    if (/^\/api\/v1\/system\/configs\/[^/]+$/.test(pathname) && method === 'PUT') {
      const key = pathname.split('/').pop() || '';
      const body = parseJsonBody(route);
      state.systemConfigs[key] = body.value;
      await fulfillJson(route, { key, value: body.value });
      return;
    }

    if (pathname === '/api/v1/system/notifications' && method === 'GET') {
      const unreadOnly = searchParams.get('unreadOnly') === 'true';
      const items = unreadOnly ? state.notifications.filter((item) => !item.isRead) : state.notifications;
      await fulfillJson(route, {
        ...asPaginated(items, 1, 50),
        unreadCount: state.notifications.filter((item) => !item.isRead).length,
      });
      return;
    }

    if (/^\/api\/v1\/system\/notifications\/[^/]+\/read$/.test(pathname) && method === 'PUT') {
      const notificationId = pathname.split('/')[5];
      state.notifications = state.notifications.map((item) =>
        item.id === notificationId ? { ...item, isRead: true } : item
      );
      await fulfillJson(route, null);
      return;
    }

    if (pathname === '/api/v1/system/logs' && method === 'GET') {
      await fulfillJson(route, asPaginated(state.systemLogs, 1, 50));
      return;
    }

    if (pathname === '/api/v1/import/records' && method === 'GET') {
      const status = searchParams.get('status');
      const keyword = searchParams.get('keyword')?.trim();
      const filtered = state.importRecords.filter((item) => {
        const statusMatch = !status || item.status === status;
        const keywordMatch = !keyword || item.fileName.includes(keyword);
        return statusMatch && keywordMatch;
      });
      await fulfillJson(route, asPaginated(filtered, 1, 20));
      return;
    }

    if (pathname === '/api/v1/contract-doc/template/check' && method === 'GET') {
      await fulfillJson(route, { exists: true });
      return;
    }

    if (pathname === '/api/v1/contract-doc/templates' && method === 'GET') {
      await fulfillJson(route, [
        {
          exists: true,
          filename: '采购合同模板.docx',
          size: 24576,
          updatedAt: now,
        },
      ]);
      return;
    }

    if (pathname === '/api/v1/contract-doc/template' && method === 'POST') {
      await fulfillJson(route, null);
      return;
    }

    if (pathname === '/api/v1/contract-doc/template' && method === 'DELETE') {
      await fulfillJson(route, null);
      return;
    }

    if (pathname === '/api/v1/contract-doc/generate-from-purchase' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: 'mock-docx-content',
      });
      return;
    }

    if (/^\/api\/v1\/contract-doc\/[^/]+\/pdf$/.test(pathname) && method === 'GET') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ code: 404, message: 'not found', data: null }),
      });
      return;
    }

    if (/^\/api\/v1\/purchases\/[^/]+$/.test(pathname) && method === 'PUT') {
      await fulfillJson(route, purchaseContract);
      return;
    }

    if (/^\/api\/v1\/purchases\/[^/]+\/files$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (/^\/api\/v1\/contracts\/[^/]+\/files$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (/^\/api\/v1\/purchases\/[^/]+\/files$/.test(pathname) && method === 'POST') {
      await fulfillJson(route, {
        id: 'file-1',
        fileName: '采购合同附件.pdf',
        fileType: 'application/pdf',
        fileSize: 2048,
        filePath: '/mock/purchase/file-1.pdf',
        uploadedAt: now,
      });
      return;
    }

    if (/^\/api\/v1\/purchases\/files\/[^/]+$/.test(pathname) && method === 'DELETE') {
      await fulfillJson(route, null);
      return;
    }

    if (/^\/api\/v1\/sales\/[^/]+$/.test(pathname) && method === 'PUT') {
      await fulfillJson(route, salesContract);
      return;
    }

    if (/^\/api\/v1\/(purchases|sales|products|suppliers|stores|users|containers)\/[^/]+$/.test(pathname) && method === 'DELETE') {
      await fulfillJson(route, null);
      return;
    }

    await fulfillJson(route, asPaginated([]));
  });
};

export const signInAsAdmin = async (page: Page, targetPath = '/dashboard') => {
  await page.context().addInitScript(
    ({ user, token }) => {
      const authState = {
        state: {
          user,
          token,
          isAuthenticated: true,
        },
        version: 0,
      };
      try {
        window.sessionStorage.setItem('auth-storage', JSON.stringify(authState));
        window.sessionStorage.setItem('jiesong_access_token', token);
      } catch {
        // 某些下载/跨源文档无可用 sessionStorage，忽略即可。
      }
    },
    {
      user: mockUser,
      token: mockToken,
    }
  );

  await page.goto(targetPath);
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(new RegExp(`${escapeForRegex(targetPath)}$`));
  await expect(page).not.toHaveURL(/\/login$/);
};
