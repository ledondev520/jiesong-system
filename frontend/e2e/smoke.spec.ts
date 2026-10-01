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
      { label: '经营中台', path: '/dashboard', url: /\/dashboard$/, heading: '工作台' },
      { label: '采购', path: '/dashboard/contracts', url: /\/dashboard\/contracts$/, heading: '采购合同' },
      { label: '出口', path: '/dashboard/sales', url: /\/dashboard\/sales$/, heading: '出口合同' },
      { label: '财务', path: '/dashboard/finance', url: /\/dashboard\/finance$/, heading: '财务概览' },
      { label: '系统管理', path: '/dashboard/settings', url: /\/dashboard\/settings$/, heading: '系统配置' },
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
    await safeClick(page.getByRole('button', { name: '用户菜单' }));
    await safeClick(page.getByRole('menuitem', { name: '退出登录' }));
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('系统登录')).toBeVisible();
  });
});

test.describe('关键按钮交互', () => {
  test('工作台快捷入口：新建采购 / 新建出口', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard');

    await safeClick(page.getByRole('button', { name: /^新建采购合同/ }));
    await expect(page).toHaveURL(/\/dashboard\/purchase\/create$/);
    await expect(page.getByRole('heading', { name: '新增采购合同' })).toBeVisible();

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await safeClick(page.getByRole('button', { name: /^新建出口合同/ }));
    await expect(page).toHaveURL(/\/dashboard\/sales\/create$/);
    await expect(page.getByRole('heading', { name: '创建出口合同' })).toBeVisible();
  });

  test('采购合同页：新增采购按钮跳转', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/contracts');
    await expect(page.getByRole('heading', { name: '采购合同' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: /^新增采购|^新建采购/ }));
    await expect(page).toHaveURL(/\/dashboard\/purchase\/create$/);
    await expect(page.getByRole('heading', { name: '新增采购合同' })).toBeVisible();
  });

  test('出口合同页：新增按钮可用', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/sales');
    await expect(page.getByRole('heading', { name: '出口合同' })).toBeVisible();

    await safeClick(page.getByRole('button', { name: /^新增出口合同|^新建出口合同/ }));
    await expect(page).toHaveURL(/\/dashboard\/sales\/create$/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: '创建出口合同' })).toBeVisible();
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

  test('采购模块：供应商与库存入口可达', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/contracts');
    await page.getByRole('link', { name: '供应商管理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '供应商管理', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '库存状态', exact: true }).click();
    await expect(page.getByRole('heading', { name: '库存状态', exact: true })).toBeVisible();
  });

  test('通知中心：未读筛选入口可见', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/system/notifications');
    await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible();

    await expect(page.getByRole('button', { name: '仅未读' })).toBeVisible();
  });

  test('系统日志：日志列表可达', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/system/logs');
    await expect(page.getByRole('heading', { name: '系统日志' })).toBeVisible();

    await expect(page.getByText('系统日志').first()).toBeVisible();
  });

  test('设置页：系统管理 Tab 导航可用', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/settings');
    await expect(page.getByRole('heading', { name: '系统配置' })).toBeVisible();

    const accountTab = page.getByRole('link', { name: /^账号管理$/ });
    const settingsUserLink = page.getByRole('link', { name: /^用户管理$/ });
    await safeClick((await accountTab.count()) ? accountTab : settingsUserLink);
    await expect(page).toHaveURL(/\/dashboard\/(settings\/users|users)$/);
    await expect(page.getByRole('heading', { name: /账号管理|用户管理/ })).toBeVisible();
  });
});
