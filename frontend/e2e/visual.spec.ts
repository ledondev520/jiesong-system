/**
 * Visual regression coverage for the highest-signal entry pages.
 */

import { expect, test, type Page } from '@playwright/test';
import { mockApiRoutes, signInAsAdmin } from './helpers';

const screenshotOptions = {
  animations: 'disabled' as const,
  fullPage: true,
};

const getHeaderDateMask = (page: Page) => page.locator('header >> text=/\\d{2}\\/\\d{2}/');

test.describe('visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('visual-login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('系统登录')).toBeVisible();
    await expect(page).toHaveScreenshot('login-page.png', screenshotOptions);
  });

  test('visual-dashboard', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard');
    await expect(page.getByRole('heading', { name: '当前焦点' })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard-page.png', {
      ...screenshotOptions,
      mask: [getHeaderDateMask(page)],
    });
  });

  test('visual-procurement', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/contracts');
    await expect(page.getByText('采购执行概览')).toBeVisible();
    await expect(page).toHaveScreenshot('procurement-page.png', {
      ...screenshotOptions,
      mask: [getHeaderDateMask(page)],
    });
  });

  test('visual-finance', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/finance');
    await expect(page.getByText('当前结算汇率')).toBeVisible();
    await expect(page).toHaveScreenshot('finance-page.png', {
      ...screenshotOptions,
      mask: [getHeaderDateMask(page)],
    });
  });
});

test.describe('visual regression mobile', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('visual-mobile-dashboard-first-screen', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard');
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard-mobile-first-screen.png', screenshotOptions);
  });
});
