import { expect, type Page, type Route } from '@playwright/test';

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

    if (pathname === '/api/v1/ai/parse' && method === 'POST') {
      await fulfillJson(route, {
        items: [],
        unresolvedRows: [],
      });
      return;
    }

    if (pathname === '/api/v1/import/history' && method === 'GET') {
      await fulfillJson(route, state.importRecords);
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

    if (pathname === '/api/v1/system/import/records' && method === 'GET') {
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
  await expect(page).toHaveURL(new RegExp(targetPath.replace('/', '\\/')));
  await expect(page).not.toHaveURL(/\/login$/);
};
