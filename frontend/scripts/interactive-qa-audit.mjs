import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:3001';
const RUN_ID = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  'qa-artifacts',
  `interactive-qa-${RUN_ID}`
);

const now = '2026-03-01T08:00:00.000Z';
const mockUser = {
  id: 'u-admin',
  username: 'admin',
  name: '管理员',
  role: 'ADMIN',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const mockToken = 'e2e-mock-token';

const knownNavLabels = [
  '工作台',
  '采购合同',
  '出口合同',
  '库存状态',
  '收付款',
  '采购建议',
  'AI 管理',
  '合同模板',
  '系统管理',
  '基础设置',
  '通知中心',
  '系统日志',
  '导入记录',
];

const paginated = (items, page = 1, pageSize = 20) => ({
  items,
  pagination: {
    total: items.length,
    page,
    pageSize,
    totalPages: items.length === 0 ? 0 : Math.ceil(items.length / pageSize),
  },
});

const createMockState = () => ({
  notifications: [
    {
      id: 'n-1',
      userId: mockUser.id,
      type: 'SYSTEM',
      title: '系统维护通知',
      content: '今晚 22:00 进行系统维护。',
      isRead: false,
      createdAt: now,
    },
    {
      id: 'n-2',
      userId: mockUser.id,
      type: 'IMPORT',
      title: '导入完成',
      content: 'CSV 导入任务已完成。',
      isRead: true,
      createdAt: now,
    },
  ],
  logs: [
    {
      id: 'log-1',
      action: 'IMPORT_DATA',
      entity: 'import_record',
      createdAt: now,
      user: { id: mockUser.id, name: mockUser.name, username: mockUser.username },
    },
    {
      id: 'log-2',
      action: 'UPDATE_PRODUCT',
      entity: 'product',
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
      importedAt: now,
      importedBy: mockUser.name,
    },
  ],
});

const makeJson = (data, message = 'ok') => ({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify({ code: 200, message, data }),
});

const ensureOutputDir = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
};

const attachRuntimeCollectors = (page) => {
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  return { pageErrors, consoleErrors };
};

const installAuth = async (page) => {
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
        // Ignore storage errors in non-document contexts.
      }
    },
    {
      user: mockUser,
      token: mockToken,
    }
  );
};

const installMockApi = async (page) => {
  const state = createMockState();

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method().toUpperCase();

    if (!pathname.startsWith('/api/v1/')) {
      await route.fulfill(makeJson(null));
      return;
    }

    if (pathname === '/api/v1/auth/login' && method === 'POST') {
      await route.fulfill(makeJson({ user: mockUser, token: mockToken }));
      return;
    }

    if (pathname === '/api/v1/ai/greeting' && method === 'GET') {
      await route.fulfill(
        makeJson({
          greeting: '欢迎回来，今天也要稳步推进。',
          songName: '倔强',
          lyrics: ['当我和世界不一样', '那就让我不一样'],
          source: 'local',
        })
      );
      return;
    }

    if (pathname === '/api/v1/dashboard/analytics' && method === 'GET') {
      await route.fulfill(
        makeJson({
          contracts: {
            purchase: { count: 1, totalAmount: 120000, paidAmount: 30000, unpaidAmount: 90000 },
            sales: { count: 1, totalAmount: 220000, receivedAmount: 50000, receivable: 170000 },
          },
          inventory: { productCount: 1, recordCount: 1, totalQuantity: 80 },
          shipments: {
            monthly: [{ month: '2026-01', count: 1, amount: 90000, boxes: 12 }],
          },
          topProducts: [{ productName: '不锈钢门', count: 3, quantity: 80, totalAmount: 90000 }],
          storeStats: [{ storeName: '洛杉矶店', orderCount: 3, quantity: 80, totalAmount: 90000 }],
        })
      );
      return;
    }

    if (pathname === '/api/v1/dashboard/stats' && method === 'GET') {
      await route.fulfill(
        makeJson({
          overview: {
            purchaseContracts: 1,
            salesContracts: 1,
            products: 1,
            containers: 1,
          },
        })
      );
      return;
    }

    if (pathname === '/api/v1/dashboard/track-product' && method === 'GET') {
      await route.fulfill(
        makeJson([
          {
            salesContractId: 'sc-001',
            contractNo: 'EXP2600001',
            portName: '洛杉矶港',
            status: 'DRAFT',
            eta: '2026-03-20',
            storeName: '洛杉矶店',
            productName: '不锈钢门',
            quantity: 40,
          },
        ])
      );
      return;
    }

    if (pathname === '/api/v1/system/notifications' && method === 'GET') {
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
      const items = unreadOnly
        ? state.notifications.filter((item) => !item.isRead)
        : state.notifications;
      await route.fulfill(
        makeJson({
          ...paginated(items, 1, 50),
          unreadCount: state.notifications.filter((item) => !item.isRead).length,
        })
      );
      return;
    }

    if (/^\/api\/v1\/system\/notifications\/[^/]+\/read$/.test(pathname) && method === 'PUT') {
      const notificationId = pathname.split('/')[5];
      state.notifications = state.notifications.map((item) =>
        item.id === notificationId ? { ...item, isRead: true } : item
      );
      await route.fulfill(makeJson(null));
      return;
    }

    if (pathname === '/api/v1/system/logs' && method === 'GET') {
      await route.fulfill(makeJson(paginated(state.logs, 1, 50)));
      return;
    }

    if (pathname === '/api/v1/import/records' && method === 'GET') {
      const status = url.searchParams.get('status');
      const keyword = url.searchParams.get('keyword')?.trim();
      const filtered = state.importRecords.filter((item) => {
        const statusMatch = !status || item.status === status;
        const keywordMatch = !keyword || item.fileName.includes(keyword);
        return statusMatch && keywordMatch;
      });
      await route.fulfill(makeJson(paginated(filtered, 1, 20)));
      return;
    }

    if (pathname === '/api/v1/system/configs' && method === 'GET') {
      await route.fulfill(
        makeJson({
          exchangeRate: 7.2,
          profitRate: 1.3,
          units: ['个', '箱', '件'],
          brokers: ['捷淞', '埋单'],
        })
      );
      return;
    }

    if (/^\/api\/v1\/system\/export\/[^/]+$/.test(pathname) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        body: 'id,name\n1,data\n',
      });
      return;
    }

    await route.fulfill(makeJson(paginated([])));
  });
};

const captureTabSequence = async (page, steps) => {
  const sequence = [];

  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) {
        return null;
      }

      const text = (active.textContent || '').replace(/\s+/g, ' ').trim();
      const ariaLabel = active.getAttribute('aria-label') || '';
      const placeholder = active.getAttribute('placeholder') || '';
      const name = ariaLabel || placeholder || text || active.getAttribute('title') || '';

      return {
        tag: active.tagName.toLowerCase(),
        role: active.getAttribute('role'),
        name,
      };
    });
    sequence.push(focused);
  }

  return sequence;
};

const getViewportMetrics = async (page) =>
  page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));

const getVisibleNavLabels = async (page) =>
  page.evaluate((labels) => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    return Array.from(document.querySelectorAll('a, button'))
      .filter((element) => isVisible(element))
      .map((element) => (element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter((text) => labels.includes(text));
  }, knownNavLabels);

const writeSummary = async (summary) => {
  const filePath = path.join(OUTPUT_DIR, 'summary.json');
  await fs.writeFile(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return filePath;
};

const runAudit = async () => {
  await ensureOutputDir();

  const browser = await chromium.launch({ headless: true });
  const findings = [];
  const summary = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    outputDir: OUTPUT_DIR,
    claims: [
      '登录页可通过键盘进入主要输入与提交控件。',
      '桌面端工作台首屏可见，并可进入通知/日志/导入记录关键交互。',
      '移动端至少应暴露一个可见的全局导航入口，保证用户不依赖桌面断点也能继续操作。',
    ],
    exploratoryScenarios: [
      '通知中心切换到“仅未读”后，继续执行“标记已读”并观察空态。',
      '移动端首屏检查在 390x844 下是否还能找到系统主导航入口。',
    ],
    checks: {},
    findings,
  };

  try {
    const loginContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const loginPage = await loginContext.newPage();
    const loginRuntime = attachRuntimeCollectors(loginPage);
    await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await loginPage.waitForLoadState('networkidle').catch(() => {});
    await loginPage.getByText('系统登录').first().waitFor();
    const loginTabSequence = await captureTabSequence(loginPage, 5);
    const loginScreenshot = path.join(OUTPUT_DIR, 'desktop-login.png');
    await loginPage.screenshot({ path: loginScreenshot, fullPage: false });
    summary.checks.login = {
      heading: await loginPage.getByText('系统登录').first().textContent(),
      tabSequence: loginTabSequence,
      screenshot: loginScreenshot,
      pageErrors: loginRuntime.pageErrors,
      consoleErrors: loginRuntime.consoleErrors,
    };

    const unnamedLoginControls = loginTabSequence.filter(
      (item) =>
        item &&
        (item.role === 'checkbox' || item.tag === 'button' || item.tag === 'input') &&
        !item.name
    );
    if (loginTabSequence.filter(Boolean).length < 3) {
      findings.push({
        id: 'F-LOGIN-KEYBOARD',
        severity: 'medium',
        message: '登录页键盘焦点链过短，未能稳定覆盖主要输入和提交控件。',
      });
    }
    if (unnamedLoginControls.length > 0) {
      findings.push({
        id: 'F-LOGIN-CHECKBOX-NAME',
        severity: 'medium',
        message:
          '登录页存在可聚焦但无可读名称的表单控件。当前键盘巡检命中了一个 `role=\"checkbox\"` 控件，但没有读到 `aria-label`、可关联标签或其它可访问名称。',
        evidence: loginScreenshot,
      });
    }
    await loginContext.close();

    const desktopContext = await browser.newContext({
      viewport: { width: 1600, height: 900 },
    });
    const desktopPage = await desktopContext.newPage();
    const desktopRuntime = attachRuntimeCollectors(desktopPage);
    await installAuth(desktopPage);
    await installMockApi(desktopPage);
    await desktopPage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForLoadState('networkidle').catch(() => {});
    await desktopPage.getByRole('heading', { name: '工作台' }).waitFor();
    const desktopNavLabels = await getVisibleNavLabels(desktopPage);
    const desktopMetrics = await getViewportMetrics(desktopPage);
    const dashboardTabSequence = await captureTabSequence(desktopPage, 6);
    const desktopDashboardScreenshot = path.join(OUTPUT_DIR, 'desktop-dashboard.png');
    await desktopPage.screenshot({ path: desktopDashboardScreenshot, fullPage: false });

    await desktopPage.goto(`${BASE_URL}/dashboard/system/notifications`, {
      waitUntil: 'domcontentloaded',
    });
    await desktopPage.getByRole('heading', { name: '通知中心' }).waitFor();
    await desktopPage.getByRole('button', { name: '仅未读' }).click();
    await desktopPage.getByRole('button', { name: '标记已读' }).click();
    await desktopPage.getByText('暂无通知。').waitFor();
    const notificationsScreenshot = path.join(OUTPUT_DIR, 'desktop-notifications.png');
    await desktopPage.screenshot({ path: notificationsScreenshot, fullPage: false });

    await desktopPage.goto(`${BASE_URL}/dashboard/system/logs`, {
      waitUntil: 'domcontentloaded',
    });
    await desktopPage.getByRole('heading', { name: '系统日志' }).waitFor();
    await desktopPage.getByRole('button', { name: '导入日志' }).click();
    await desktopPage.getByText('IMPORT_DATA').waitFor();

    await desktopPage.goto(`${BASE_URL}/dashboard/system/import-records`, {
      waitUntil: 'domcontentloaded',
    });
    await desktopPage.getByRole('heading', { name: '导入记录' }).waitFor();
    await desktopPage.getByRole('button', { name: '失败' }).click();
    await desktopPage.getByText('import-failed.csv').waitFor();

    summary.checks.desktop = {
      visibleNavLabels: desktopNavLabels,
      viewportMetrics: desktopMetrics,
      tabSequence: dashboardTabSequence,
      screenshots: [
        desktopDashboardScreenshot,
        notificationsScreenshot,
      ],
      pageErrors: desktopRuntime.pageErrors,
      consoleErrors: desktopRuntime.consoleErrors,
    };
    await desktopContext.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const mobilePage = await mobileContext.newPage();
    const mobileRuntime = attachRuntimeCollectors(mobilePage);
    await installAuth(mobilePage);
    await installMockApi(mobilePage);
    await mobilePage.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForLoadState('networkidle').catch(() => {});
    await mobilePage.getByRole('heading', { name: '工作台' }).waitFor();
    const mobileVisibleNavLabels = await getVisibleNavLabels(mobilePage);
    const mobileMetrics = await getViewportMetrics(mobilePage);
    const mobileScreenshot = path.join(OUTPUT_DIR, 'mobile-dashboard.png');
    await mobilePage.screenshot({ path: mobileScreenshot, fullPage: false });

    summary.checks.mobile = {
      visibleNavLabels: mobileVisibleNavLabels,
      viewportMetrics: mobileMetrics,
      screenshot: mobileScreenshot,
      pageErrors: mobileRuntime.pageErrors,
      consoleErrors: mobileRuntime.consoleErrors,
    };

    if (mobileVisibleNavLabels.length === 0) {
      findings.push({
        id: 'F-MOBILE-NAV',
        severity: 'high',
        message:
          '移动端 390x844 首屏没有可见的全局导航入口。侧边栏在 `md` 以下被隐藏，而顶部 Header 也没有替代的菜单按钮，用户进入工作台后无法通过界面继续切换主要模块。',
        evidence: mobileScreenshot,
      });
    }

    if (mobileMetrics.canScrollX) {
      findings.push({
        id: 'F-MOBILE-OVERFLOW',
        severity: 'medium',
        message: '移动端首屏出现横向滚动，说明存在布局溢出风险。',
      });
    }

    await mobileContext.close();
  } finally {
    await browser.close();
  }

  const summaryPath = await writeSummary(summary);
  console.log(JSON.stringify({ summaryPath, findingsCount: findings.length }, null, 2));

  if (findings.length > 0) {
    process.exitCode = 1;
  }
};

await runAudit();
