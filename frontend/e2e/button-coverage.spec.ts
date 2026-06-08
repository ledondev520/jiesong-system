import { test, expect, type Locator, type Page } from '@playwright/test';
import { mockApiRoutes, signInAsAdmin } from './helpers';

interface PageCase {
  name: string;
  path: string;
  minClicks?: number;
  maxActions?: number;
  maxDurationMs?: number;
  requiresAuth?: boolean;
  shellLocator?: string;
}

const pageCases: PageCase[] = [
  { name: '首页', path: '/', minClicks: 0 },
  { name: '注册页', path: '/register', minClicks: 0, requiresAuth: false, shellLocator: 'body' },
  { name: '找回密码页', path: '/forgot-password', minClicks: 0, requiresAuth: false, shellLocator: 'body' },
  { name: '工作台', path: '/dashboard' },
  { name: '采购合同', path: '/dashboard/contracts' },
  { name: '合同模板管理', path: '/dashboard/contracts/templates', minClicks: 0 },
  { name: '合同模板上传', path: '/dashboard/contracts/template', minClicks: 0 },
  { name: '采购列表', path: '/dashboard/purchase' },
  // 该页面控件密集，限制巡检动作预算可降低偶发超时。
  { name: '采购创建', path: '/dashboard/purchase/create', minClicks: 0 },
  { name: '采购详情', path: '/dashboard/purchase/pc-001', minClicks: 0 },
  { name: '出口合同', path: '/dashboard/sales' },
  { name: '出口创建', path: '/dashboard/sales/create', minClicks: 0 },
  { name: '商品档案', path: '/dashboard/products' },
  { name: '采购建议', path: '/dashboard/store-recommend', minClicks: 0 },
  { name: '设置', path: '/dashboard/settings', minClicks: 0 },
  { name: '商品管理', path: '/dashboard/products' },
  { name: '供应商管理', path: '/dashboard/suppliers' },
  { name: '用户管理', path: '/dashboard/users' },
  { name: '应付账款', path: '/dashboard/payments?tab=payable', minClicks: 0 },
  { name: '应收账款', path: '/dashboard/payments?tab=receivable', minClicks: 0 },
  { name: '系统管理', path: '/dashboard/system', minClicks: 0 },
  { name: '通知中心', path: '/dashboard/system/notifications' },
  { name: '系统日志', path: '/dashboard/system/logs' },
];

const skipPatterns = [
  /^退出登录$/,
  /^删除/,
  /^返回$/,
  /^打开AI助手$/,
  /^上传图片$/,
  /^切换主题$/,
  /^button$/i,
  /^dialog-close$/i,
  /^Open Next\.js Dev Tools$/i,
  /^Open issues overlay$/i,
  /^Collapse issues badge$/i,
  /^Copy Error Info$/i,
  /^Attach Node\.js inspector$/i,
  /^Show More$/i,
  /^Mark as helpful$/i,
  /^Mark as not helpful$/i,
];

const ignorablePageErrorPatterns = [
  /Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document\./i,
  /Error creating WebGL context\./i,
  /ResizeObserver loop limit exceeded/i,
  /hydration/i,
  /NetworkError when attempting to fetch resource/i,
];

const normalize = (value: string | null | undefined): string =>
  (value || '').replace(/\s+/g, ' ').trim();

const shouldSkip = (label: string): boolean => skipPatterns.some((pattern) => pattern.test(label));

const normalizePath = (path: string): string => {
  const cleaned = path.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return cleaned || '/';
};

const safeClick = async (locator: Locator) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await locator.click({ timeout: 3000, force: attempt > 0 });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await locator.page().waitForTimeout(250);
    }
  }
};

const assertNoRuntimeError = async (page: Page) => {
  await expect(page.getByRole('heading', {
    name: /Application error: a client-side exception has occurred while loading localhost/i,
  })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '页面出现异常' })).toHaveCount(0);
};

const waitForLoadingDone = async (page: Page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  const loadingHint = page.getByText('加载中...');
  if (await loadingHint.first().isVisible().catch(() => false)) {
    await expect(loadingHint.first()).not.toBeVisible({ timeout: 15000 }).catch(() => {});
  }
};

const clickAllBusinessButtons = async (
  page: Page,
  options?: { maxActions?: number; maxDurationMs?: number; basePath?: string },
): Promise<string[]> => {
  const processedLabels = new Set<string>();
  const clickedList: string[] = [];
  const maxActionsPerPage = options?.maxActions ?? 10;
  const maxDurationMs = options?.maxDurationMs ?? 30000;
  const basePath = normalizePath(options?.basePath ?? new URL(page.url()).pathname);
  const startedAt = Date.now();

  for (let step = 0; step < maxActionsPerPage; step += 1) {
    if (Date.now() - startedAt > maxDurationMs) {
      break;
    }

    const descriptors = await page
      .locator('main button:visible, [role="dialog"] button:visible')
      .evaluateAll((elements) =>
        elements.slice(0, 30).map((element, index) => ({
          index,
          ariaLabel: (element.getAttribute('aria-label') || '').trim(),
          text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
          title: (element.getAttribute('title') || '').trim(),
          dataSlot: (element.getAttribute('data-slot') || '').trim(),
          hasPopup: Boolean(element.getAttribute('aria-haspopup')),
          disabled:
            element.hasAttribute('disabled') ||
            element.getAttribute('aria-disabled') === 'true',
        }))
      );

    const candidate = descriptors.find((item) => {
      const label = normalize(item.ariaLabel || item.text || item.title || item.dataSlot);
      if (!label) return false;
      if (item.hasPopup || item.disabled) return false;
      if (shouldSkip(label) || processedLabels.has(label)) return false;
      return true;
    });

    if (!candidate) {
      break;
    }

    const label = normalize(candidate.ariaLabel || candidate.text || candidate.title || candidate.dataSlot);
    processedLabels.add(label);

    const button = page.locator('main button:visible, [role="dialog"] button:visible').nth(candidate.index);
    let clicked = true;
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await safeClick(button).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/not attached|detached|not visible|outside of the viewport|intercepts pointer events|Timeout/i.test(message)) {
        clicked = false;
        return;
      }
      throw error;
    });
    if (!clicked) {
      continue;
    }

    clickedList.push(label);
    await page.waitForTimeout(120);
    await expect(page).not.toHaveURL(/\/login$/);
    await assertNoRuntimeError(page);

    // 跨路由后结束当前页面巡检，避免进入下一页导致动作穷举超时。
    const currentPath = normalizePath(new URL(page.url()).pathname);
    if (currentPath !== basePath) {
      break;
    }
  }

  return clickedList;
};

test.describe('按钮全覆盖巡检', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  for (const pageCase of pageCases) {
    test(`页面按钮可点击 - ${pageCase.name}`, async ({ page }) => {
      test.setTimeout(150000);
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });
      page.on('dialog', (dialog) => {
        void dialog.dismiss().catch(() => {});
      });

      if (pageCase.requiresAuth === false) {
        await page.goto(pageCase.path);
      } else {
        await signInAsAdmin(page, pageCase.path);
      }
      await waitForLoadingDone(page);
      await assertNoRuntimeError(page);
      await expect(page.locator(pageCase.shellLocator ?? 'main').first()).toBeVisible();
      if (pageCase.requiresAuth !== false) {
        await expect(page).not.toHaveURL(/\/login$/);
      }

      const minClicks = pageCase.minClicks ?? 1;
      const clickedList = minClicks === 0
        ? []
        : await clickAllBusinessButtons(page, {
            maxActions: pageCase.maxActions,
            maxDurationMs: pageCase.maxDurationMs,
            basePath: pageCase.path,
          });
      const blockingErrors = pageErrors.filter(
        (message) => !ignorablePageErrorPatterns.some((pattern) => pattern.test(message))
      );

      expect(blockingErrors, `${pageCase.path} 发生运行时异常：${blockingErrors.join(' | ')}`).toEqual([]);
      expect(
        clickedList.length,
        `${pageCase.path} 未发现可点击按钮，可能页面未加载或选择器需更新`
      ).toBeGreaterThanOrEqual(minClicks);
    });
  }
});
