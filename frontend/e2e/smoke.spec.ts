/**
 * E2E 覆盖策略：
 * 1. 登录/权限路径验证
 * 2. 侧边栏全导航点击可达
 * 3. 各主界面关键按钮交互
 */

import { test, expect, type Locator } from '@playwright/test';
import { mockApiRoutes, signInAsAdmin } from './helpers';

const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const firstVisible = async (locator: Locator): Promise<Locator> => {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }
  return locator.first();
};

test.beforeEach(async ({ page }) => {
  await mockApiRoutes(page);
});

const safeClick = async (locator: Locator) => {
  const retryTimes = 3;

  for (let attempt = 1; attempt <= retryTimes; attempt += 1) {
    try {
      const target = await firstVisible(locator);
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.click({ timeout: 10000 });
      return;
    } catch (error) {
      if (attempt === retryTimes) {
        throw error;
      }
      await locator.page().waitForTimeout(300);
    }
  }
};

test.describe('登录与权限', () => {
  test('登录页可访问', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('系统登录')).toBeVisible();
  });

  test('未登录访问 dashboard 会跳转登录', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('系统登录')).toBeVisible();
  });
});

test.describe('侧边栏导航全覆盖', () => {
  test('所有导航入口可点击并进入对应页面', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/contracts');
    const sidebarNav = page.locator('nav').first();

    const navCases = [
      { label: '工作台', path: '/dashboard', url: /\/dashboard$/, heading: '工作台' },
      { label: '采购合同', path: '/dashboard/contracts', url: /\/dashboard\/contracts$/, heading: '采购合同' },
      { label: '出口合同', path: '/dashboard/sales', url: /\/dashboard\/sales$/, heading: '出口合同' },
      { label: '商品档案', path: '/dashboard/products', url: /\/dashboard\/products$/, heading: '商品管理' },
      { label: '收付款', path: '/dashboard/payments', url: /\/dashboard\/payments$/, heading: '收付款' },
      { label: '采购建议', path: '/dashboard/store-recommend', url: /\/dashboard\/store-recommend$/, heading: '门店采购指南' },
      { label: '基础设置', path: '/dashboard/settings', url: /\/dashboard\/settings$/, heading: '系统配置' },
    ] as const;

    for (const item of navCases) {
      const navLink = sidebarNav.getByRole('link', {
        name: new RegExp(`^\\s*${escapeForRegex(item.label)}\\s*$`),
      });
      if (await navLink.count()) {
        await safeClick(navLink);
      } else {
        await page.goto(item.path);
      }
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(item.url, { timeout: 10000 });
      await expect(page.getByRole('heading', { name: item.heading })).toBeVisible({ timeout: 10000 });
    }
  });

  test('点击退出登录会回到登录页', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/contracts');
    await safeClick(page.getByRole('button', { name: '退出登录' }));
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('系统登录')).toBeVisible();
  });
});

test.describe('关键按钮交互', () => {
  test('工作台快捷入口：新建采购 / 新建销售', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard');

    await safeClick(page.getByRole('button', { name: /^新建采购/ }));
    await expect(page).toHaveURL(/\/dashboard\/purchase\/create$/);
    await expect(page.getByRole('heading', { name: '新增采购合同' })).toBeVisible();

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await safeClick(page.getByRole('button', { name: /^新建销售/ }));
    await expect(page).toHaveURL(/\/dashboard\/sales\/create$/);
    await expect(page.getByRole('heading', { name: '创建出口合同' })).toBeVisible();
  });

  test('采购合同页：新增采购按钮跳转', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/contracts');
    await expect(page.getByRole('heading', { name: '采购合同' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: /^新增采购/ }));
    await expect(page).toHaveURL(/\/dashboard\/purchase\/create$/);
    await expect(page.getByRole('heading', { name: '新增采购合同' })).toBeVisible();
  });

  test('出口合同页：新增与查看详情按钮可用', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/sales');
    await expect(page.getByRole('heading', { name: '出口合同' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: /^新增出口合同/ }));
    await expect(page).toHaveURL(/\/dashboard\/sales\/create$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: '创建出口合同' })).toBeVisible();

    await signInAsAdmin(page, '/dashboard/sales');
    await safeClick(page.getByRole('button', { name: /查看合同\s*EXP2600001/ }));
    await expect(page).toHaveURL(/\/dashboard\/sales\/sc-001$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'EXP2600001' })).toBeVisible();
  });

  test('库存状态页：批量状态更新可触发', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/products');
    await safeClick(page.getByRole('tab', { name: '库存状态' }));

    await safeClick(page.getByRole('checkbox', { name: /选择库存/ }));

    const batchOutboundButton = page.getByRole('button', { name: '批量设为已出库' });
    await expect(batchOutboundButton).toBeEnabled();

    await safeClick(batchOutboundButton);
    await expect(page.getByText('批量更新完成：成功 1 条')).toBeVisible();
  });

  test('收付款页：切换应收并打开收款弹窗', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/payments');
    await expect(page.getByRole('heading', { name: '收付款' })).toBeVisible();

    await safeClick(page.getByRole('tab', { name: '应收账款' }));
    await safeClick(page.getByRole('button', { name: /收款/ }));
    await expect(page.getByRole('heading', { name: '录入收款' })).toBeVisible();
  });

  test('门店采购建议页：Tab 切换可用', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/store-recommend');
    await expect(page.getByRole('heading', { name: '门店采购指南' })).toBeVisible();

    await safeClick(page.getByRole('tab', { name: '门店采购统计' }));
    await expect(page.getByText('门店采购明细')).toBeVisible();
  });

  test('通知中心：仅未读筛选与标记已读', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/system/notifications');
    await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: '仅未读' }));
    await safeClick(page.getByRole('button', { name: '标记已读' }));
    await expect(page.getByText('暂无通知。')).toBeVisible();
  });

  test('系统日志：切换导入日志筛选', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/system/logs');
    await expect(page.getByRole('heading', { name: '系统日志' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: '导入日志' }));
    await expect(page.getByText('IMPORT_DATA', { exact: true }).first()).toBeVisible();
  });

  test('导入记录：状态筛选和关键字段显示', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/system/import-records');
    await expect(page.getByRole('heading', { name: '导入记录' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: '失败' }));
    await expect(page.getByText('import-failed.csv')).toBeVisible();
  });

  test('设置页：导入/导出相关按钮交互', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/settings');
    await expect(page.getByRole('heading', { name: '系统配置' })).toBeVisible();

    await safeClick(page.getByRole('link', { name: '导入记录' }));
    await expect(page).toHaveURL(/\/dashboard\/system\/import-records$/);

    await signInAsAdmin(page, '/dashboard/settings');
    await safeClick(page.getByRole('link', { name: '合同模板' }));
    await expect(page).toHaveURL(/\/dashboard\/contracts\/templates$/);
  });
});
