import { test, expect, type Locator, type Page } from '@playwright/test';
import { mockApiRoutes, signInAsAdmin } from './helpers';

interface PageCase {
  name: string;
  path: string;
  minClicks?: number;
}

const pageCases: PageCase[] = [
  { name: '首页', path: '/', minClicks: 0 },
  { name: '注册页', path: '/register', minClicks: 0 },
  { name: '找回密码页', path: '/forgot-password', minClicks: 0 },
  { name: '工作台', path: '/dashboard' },
  { name: '采购合同', path: '/dashboard/contracts' },
  { name: '合同模板管理', path: '/dashboard/contracts/templates', minClicks: 0 },
  { name: '合同模板上传', path: '/dashboard/contracts/template', minClicks: 0 },
  { name: '采购列表', path: '/dashboard/purchase' },
  { name: '采购创建', path: '/dashboard/purchase/create' },
  { name: '采购详情', path: '/dashboard/purchase/pc-001' },
  { name: '销售合同', path: '/dashboard/sales' },
  { name: '销售创建', path: '/dashboard/sales/create' },
  { name: '销售详情', path: '/dashboard/sales/sc-001' },
  { name: 'AI 会话', path: '/dashboard/ai/sessions', minClicks: 0 },
  { name: 'AI Token 统计', path: '/dashboard/ai/token-stats', minClicks: 0 },
  { name: 'AI 模型管理', path: '/dashboard/ai/models', minClicks: 0 },
  { name: '库存状态', path: '/dashboard/inventory-container' },
  { name: '库存管理', path: '/dashboard/inventory', minClicks: 0 },
  { name: '收付款', path: '/dashboard/payments' },
  { name: '采购建议', path: '/dashboard/store-recommend', minClicks: 0 },
  { name: '设置', path: '/dashboard/settings', minClicks: 0 },
  { name: '分类设置', path: '/dashboard/settings/categories', minClicks: 0 },
  { name: '港口设置', path: '/dashboard/settings/ports', minClicks: 0 },
  { name: '商品管理', path: '/dashboard/products' },
  { name: '供应商管理', path: '/dashboard/suppliers' },
  { name: '门店管理', path: '/dashboard/stores' },
  { name: '用户管理', path: '/dashboard/users' },
  { name: '货柜管理', path: '/dashboard/containers' },
  { name: '货柜详情', path: '/dashboard/containers/ct-1' },
  { name: '财务概览', path: '/dashboard/finance', minClicks: 0 },
  { name: '应付账款', path: '/dashboard/finance/payable' },
  { name: '应收账款', path: '/dashboard/finance/receivable' },
  { name: '导入页', path: '/dashboard/import' },
  { name: '报表页', path: '/dashboard/reports', minClicks: 0 },
  { name: '日志页', path: '/dashboard/logs', minClicks: 0 },
  { name: '通知中心', path: '/dashboard/system/notifications' },
  { name: '系统日志', path: '/dashboard/system/logs' },
  { name: '导入记录', path: '/dashboard/system/import-records' },
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

const normalize = (value: string | null | undefined): string =>
  (value || '').replace(/\s+/g, ' ').trim();

const shouldSkip = (label: string): boolean => skipPatterns.some((pattern) => pattern.test(label));

const safeClick = async (locator: Locator) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await locator.click({ timeout: 1500, force: attempt > 0 });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await locator.page().waitForTimeout(200);
    }
  }
};

const assertNoRuntimeError = async (page: Page) => {
  await expect(page.getByRole('heading', {
    name: /Application error: a client-side exception has occurred while loading localhost/i,
  })).toHaveCount(0);
};

const waitForLoadingDone = async (page: Page) => {
  await page.waitForLoadState('domcontentloaded');
  const loadingHint = page.getByText('加载中...');
  if (await loadingHint.first().isVisible().catch(() => false)) {
    await expect(loadingHint.first()).not.toBeVisible({ timeout: 15000 }).catch(() => {});
  }
};

const clickAllBusinessButtons = async (page: Page, routePath: string): Promise<string[]> => {
  const processedLabels = new Set<string>();
  const clickedList: string[] = [];
  const maxActionsPerPage = 10;
  const maxDurationMs = 30000;
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
  }

  return clickedList;
};

test.describe('按钮全覆盖巡检', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  for (const pageCase of pageCases) {
    test(`页面按钮可点击 - ${pageCase.name}`, async ({ page }) => {
      test.setTimeout(120000);
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });
      page.on('dialog', (dialog) => {
        void dialog.dismiss().catch(() => {});
      });

      await signInAsAdmin(page, pageCase.path);
      await waitForLoadingDone(page);
      await expect(page).not.toHaveURL(/\/login$/);
      await assertNoRuntimeError(page);

      const clickedList = await clickAllBusinessButtons(page, pageCase.path);
      const minClicks = pageCase.minClicks ?? 1;
      const blockingErrors = pageErrors.filter(
        (message) =>
          !message.includes(
            "Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document."
          ) &&
          !message.includes('Error creating WebGL context.')
      );

      expect(blockingErrors, `${pageCase.path} 发生运行时异常：${blockingErrors.join(' | ')}`).toEqual([]);
      expect(
        clickedList.length,
        `${pageCase.path} 未发现可点击按钮，可能页面未加载或选择器需更新`
      ).toBeGreaterThanOrEqual(minClicks);
    });
  }
});
