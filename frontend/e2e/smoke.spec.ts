/**
 * Input: 本地运行中的前端服务
 * Output: 自动化冒烟验收结果
 * Pos: 前端自动化验收测试（E2E）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { test, expect } from '@playwright/test';

test.describe('前端冒烟验收', () => {
  test('登录页可访问并展示关键元素', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('系统登录')).toBeVisible();
    await expect(page.getByPlaceholder('admin')).toBeVisible();
    await expect(page.getByPlaceholder('••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
  });

  test('未登录访问dashboard会跳转到登录', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('登录后访问销售页可展示列表数据（接口Mock）', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/login')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: '登录成功',
            data: {
              token: 'mock-token',
              user: { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true },
            },
          }),
        });
        return;
      }

      if (url.includes('/sales')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: '获取成功',
            data: {
              items: [
                {
                  id: 'sc-001',
                  contractNo: 'EXP2500001',
                  status: 'DRAFT',
                  signedAt: null,
                  totalBoxes: 12,
                  volume: 28.5,
                  grossWeight: 18600,
                  totalAmount: 250000,
                  port: { id: 'p-1', name: '深圳盐田港' },
                },
              ],
              pagination: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: { items: [] } }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('admin');
    await page.getByPlaceholder('••••••').fill('admin123');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForFunction(() => localStorage.getItem('token') === 'mock-token');
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('auth-storage');
      return Boolean(raw && raw.includes('isAuthenticated') && raw.includes('true'));
    });
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true },
            token: 'mock-token',
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });

    await page.goto('/dashboard/sales');
    await expect(page.getByRole('heading', { name: '出口合同' })).toBeVisible();
    await expect(page.getByText('EXP2500001')).toBeVisible();
    await expect(page.getByText('深圳盐田港')).toBeVisible();
    await expect(page.getByText('$250,000')).toBeVisible();
    await expect(page.getByRole('button', { name: /查看合同 EXP2500001/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /删除合同 EXP2500001/ })).toBeVisible();
  });

  test('登录后访问采购页可展示列表数据（接口Mock）', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/login')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: '登录成功',
            data: {
              token: 'mock-token',
              user: { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true },
            },
          }),
        });
        return;
      }

      if (url.includes('/purchases')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: '获取成功',
            data: {
              items: [
                {
                  id: 'pc-001',
                  contractNo: 'CG2500001',
                  status: 'DRAFT',
                  signedAt: null,
                  totalAmount: 120000,
                  paidAmount: 30000,
                  supplier: { id: 's-1', name: '佛山陶瓷供应商', hasQualityIssue: false },
                },
              ],
              pagination: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: { items: [] } }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('admin');
    await page.getByPlaceholder('••••••').fill('admin123');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForFunction(() => localStorage.getItem('token') === 'mock-token');
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true },
            token: 'mock-token',
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });

    await page.goto('/dashboard/purchase');
    await expect(page.getByRole('heading', { name: '采购管理' })).toBeVisible();
    await expect(page.getByText('CG2500001')).toBeVisible();
    await expect(page.getByText('佛山陶瓷供应商')).toBeVisible();
    await expect(page.getByText('¥120,000')).toBeVisible();
    await expect(page.getByRole('button', { name: /查看合同 CG2500001/ })).toBeVisible();
  });

  test('登录后访问销售详情页可展示合同与明细（接口Mock）', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/login')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: '登录成功',
            data: {
              token: 'mock-token',
              user: { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true },
            },
          }),
        });
        return;
      }

      if (url.includes('/sales/sc-001')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            message: '获取成功',
            data: {
              id: 'sc-001',
              contractNo: 'EXP2500002',
              status: 'DRAFT',
              signedAt: null,
              totalAmount: 300000,
              paidAmount: 90000,
              volume: 35.6,
              grossWeight: 20500,
              totalBoxes: 22,
              note: 'Mock 详情备注',
              supplier: { id: 'sp-1', name: '深圳国际供应商' },
              port: { id: 'p-1', name: '宁波港' },
              items: [
                {
                  id: 'si-1',
                  quantity: 100,
                  unit: '件',
                  unitPrice: 1200,
                  totalPrice: 120000,
                  product: { id: 'pr-1', customsName: '瓷砖A', specification: '600x600', unit: '件' },
                },
              ],
            },
          }),
        });
        return;
      }

      if (url.includes('/sales')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, message: '获取成功', data: { items: [] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: { items: [] } }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder('admin').fill('admin');
    await page.getByPlaceholder('••••••').fill('admin123');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForFunction(() => localStorage.getItem('token') === 'mock-token');
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-token');
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true },
            token: 'mock-token',
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });

    await page.goto('/dashboard/sales/sc-001');
    await expect(page.getByText('EXP2500002')).toBeVisible();
    await expect(page.getByText('宁波港')).toBeVisible();
    await expect(page.getByRole('tab', { name: '装箱明细' })).toBeVisible();
    await expect(page.getByText('暂无装箱商品，点击"添加商品"开始装柜')).toBeVisible();
    await expect(page.getByText('$300,000')).toBeVisible();
  });
});

