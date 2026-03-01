/**
 * E2E 冒烟测试 - 完整覆盖
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const mockUser = { id: 'u-admin', username: 'admin', name: '管理员', role: 'ADMIN', isActive: true };
const mockToken = 'mock-token-12345';

function getPathname(url: string) {
  return new URL(url).pathname;
}

async function fulfillJson(route: Route, data: unknown, message = 'ok') {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 200, message, data }),
  });
}

async function setAuth(page: Page) {
  await page.addInitScript(({ user, token }: { user: typeof mockUser; token: string }) => {
    sessionStorage.setItem('jiesong_access_token', token);
    sessionStorage.setItem(
      'auth-storage',
      JSON.stringify({
        state: { user, token, isAuthenticated: true },
        version: 0,
      })
    );
  }, { user: mockUser, token: mockToken });
  
  // 确保认证脚本注入完成
  await page.goto('/');
}

test.describe('系统登录与权限', () => {
  test('登录页可访问并展示关键元素', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('系统登录')).toBeVisible();
  });

  test('未登录访问 dashboard 会跳转到登录', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('登录后访问销售页可展示列表数据（接口 Mock）', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const pathname = getPathname(route.request().url());

      if (pathname === '/api/v1/sales') {
        await fulfillJson(route, {
          items: [
            {
              id: 'sc-001',
              contractNo: 'EXP2500001',
              status: 'DRAFT',
              totalAmount: 250000,
              totalBoxes: 12,
              volume: 28.5,
              grossWeight: 18600,
              port: { id: 'p-1', name: '深圳盐田港' },
            },
          ],
          pagination: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
        }, '获取成功');
        return;
      }

      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/sales');

    await expect(page.getByRole('heading', { name: '出口合同' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('EXP2500001')).toBeVisible();
    await expect(page.getByText('深圳盐田港')).toBeVisible();
    await expect(page.getByText('$250,000')).toBeVisible();
  });

  test('登录后访问销售详情页可展示合同与明细（接口 Mock）', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const pathname = getPathname(route.request().url());

      if (pathname === '/api/v1/sales/sc-001') {
        await fulfillJson(route, {
          id: 'sc-001',
          contractNo: 'EXP2500002',
          status: 'DRAFT',
          totalAmount: 300000,
          receivedAmount: 90000,
          exchangeRate: 7.2,
          totalBoxes: 22,
          grossWeight: 20500,
          netWeight: 19600,
          volume: 35.6,
          packingItems: [],
          port: { id: 'p-1', name: '宁波港' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }, '获取成功');
        return;
      }

      // 详情页会并发请求这些基础数据
      if (pathname === '/api/v1/products' || pathname === '/api/v1/stores' || pathname === '/api/v1/inventory') {
        await fulfillJson(route, { items: [], pagination: { total: 0, page: 1, pageSize: 100, totalPages: 0 } }, '获取成功');
        return;
      }

      // 关键修复：只拦截精确列表路径，避免误伤 /sales/:id 详情请求
      if (pathname === '/api/v1/sales') {
        await fulfillJson(route, { items: [], pagination: { total: 0, page: 1, pageSize: 100, totalPages: 0 } }, '获取成功');
        return;
      }

      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/sales/sc-001');

    await expect(page.getByRole('heading', { name: 'EXP2500002' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('宁波港')).toBeVisible();
    await expect(page.getByRole('tab', { name: '装箱明细' })).toBeVisible();
    await expect(page.getByText('暂无装箱商品，点击"添加商品"开始装柜')).toBeVisible();
    await expect(page.getByText('$300,000')).toBeVisible();
  });

  test('采购列表页', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (route.request().url().includes('/purchases')) {
        await fulfillJson(route, { items: [{ id: 'pc-001' }] });
        return;
      }
      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/purchase');
    await expect(page.getByText('采购')).toBeVisible({ timeout: 10000 });
  });

  test('库存列表页', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (route.request().url().includes('/inventory')) {
        await fulfillJson(route, { items: [{ id: 'inv-001' }] });
        return;
      }
      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/inventory');
    await expect(page.getByText('库存')).toBeVisible({ timeout: 10000 });
  });

  test('产品列表页', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (route.request().url().includes('/products')) {
        await fulfillJson(route, { items: [] });
        return;
      }
      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/products');
    await expect(page.getByText('产品')).toBeVisible({ timeout: 10000 });
  });

  test('供应商列表页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/suppliers');
    await expect(page.getByText('供应商')).toBeVisible({ timeout: 10000 });
  });

  test('用户管理页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/users');
    await expect(page.getByText('用户')).toBeVisible({ timeout: 10000 });
  });

  test('仓库列表页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/stores');
    await expect(page.getByText('仓库')).toBeVisible({ timeout: 10000 });
  });

  test('财务管理页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/finance');
    await expect(page.getByText('财务')).toBeVisible({ timeout: 10000 });
  });

  test('货柜管理页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/containers');
    await expect(page.getByText('货柜')).toBeVisible({ timeout: 10000 });
  });

  test('报表页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/reports');
    await expect(page.getByText('报表')).toBeVisible({ timeout: 10000 });
  });

  test('系统设置页', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/settings');
    await expect(page.getByText('设置')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('核心业务流程', () => {
  test('采购列表页可访问', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (route.request().url().includes('/purchases')) {
        await fulfillJson(route, { items: [{ id: 'pc-001', contractNo: 'CG2500001' }] });
        return;
      }
      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/purchase');
    await expect(page.getByText('采购')).toBeVisible({ timeout: 10000 });
  });

  test('库存列表页可访问', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (route.request().url().includes('/inventory')) {
        await fulfillJson(route, { items: [{ id: 'inv-001' }] });
        return;
      }
      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/inventory');
    await expect(page.getByText('库存')).toBeVisible({ timeout: 10000 });
  });

  test('产品列表页可访问', async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      if (route.request().url().includes('/products')) {
        await fulfillJson(route, { items: [] });
        return;
      }
      await fulfillJson(route, { items: [] });
    });

    await setAuth(page);
    await page.goto('/dashboard/products');
    await expect(page.getByText('产品')).toBeVisible({ timeout: 10000 });
  });

  test('供应商列表页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/suppliers');
    await expect(page.getByText('供应商')).toBeVisible({ timeout: 10000 });
  });

  test('用户管理页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/users');
    await expect(page.getByText('用户')).toBeVisible({ timeout: 10000 });
  });

  test('仓库列表页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/stores');
    await expect(page.getByText('仓库')).toBeVisible({ timeout: 10000 });
  });

  test('财务管理页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/finance');
    await expect(page.getByText('财务')).toBeVisible({ timeout: 10000 });
  });

  test('货柜管理页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/containers');
    await expect(page.getByText('货柜')).toBeVisible({ timeout: 10000 });
  });

  test('报表页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/reports');
    await expect(page.getByText('报表')).toBeVisible({ timeout: 10000 });
  });

  test('系统设置页可访问', async ({ page }) => {
    await setAuth(page);
    await page.goto('/dashboard/settings');
    await expect(page.getByText('设置')).toBeVisible({ timeout: 10000 });
  });
});
