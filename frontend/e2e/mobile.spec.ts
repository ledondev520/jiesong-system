/**
 * Input: 合成 API 夹具与手机、平板、桌面视口
 * Output: 页面可达、延迟账簿内部滚动、注册申请及核心交互验收
 * Pos: Playwright 移动端回归，保持运行时异常与整页宽度检查
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Page } from '@playwright/test';
import { mockApiRoutes, signInAsAdmin } from './helpers';

// 合成数据验收布局和交互；不向真实业务接口提交记录。
const routes = [
  '/dashboard', '/dashboard/reports', '/dashboard/contracts', '/dashboard/purchase/create',
  '/dashboard/purchase/pc-001', '/dashboard/suppliers', '/dashboard/products', '/dashboard/inventory-status',
  '/dashboard/sales', '/dashboard/sales/create', '/dashboard/sales/sc-001',
  '/dashboard/tax-refunds', '/dashboard/tax-refunds?view=customs', '/dashboard/tax-refunds?view=refunds',
  '/dashboard/tax-refunds/create', '/dashboard/customs-declarations/create', '/dashboard/hs-codes',
  '/dashboard/finance', '/dashboard/finance/statements', '/dashboard/payments',
  '/dashboard/finance/receivable', '/dashboard/finance/payable', '/dashboard/finance/bank-flow',
  '/dashboard/finance/invoices', '/dashboard/finance/reconciliation',
  '/dashboard/settings', '/dashboard/users', '/dashboard/system/logs',
  '/dashboard/system/notifications', '/dashboard/ai', '/dashboard/ai/sessions', '/dashboard/about',
  '/dashboard/settings/ports', '/dashboard/settings/categories', '/dashboard/settings/customs-brokers',
  '/dashboard/settings/export', '/dashboard/settings/users', '/dashboard/system',
  '/dashboard/logistics', '/dashboard/logistics/containers', '/dashboard/contracts/templates',
];

async function expectFitsViewport(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) {
    console.log('OVERFLOW', new URL(page.url()).pathname, overflow);
    await page.screenshot({ path: test.info().outputPath(new URL(page.url()).pathname.replaceAll('/', '-') + '.png') });
  }
  expect.soft(overflow, page.url()).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 430]) {
  test.describe(`手机 ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    test.beforeEach(async ({ page }) => {
      await mockApiRoutes(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });
    test('所有主页面内容与导航可达且不撑宽视口', async ({ page }) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => { errors.push(error.message); console.log('PAGE ERROR', error.message); });
      await signInAsAdmin(page);
      for (const route of routes) {
        await test.step(route, async () => {
          await page.goto(route);
          await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible();
          await expect(page.locator('main').first()).not.toBeEmpty();
          await expect(page.getByText('页面出现异常')).toHaveCount(0);
          await page.waitForLoadState('networkidle');
          if (route === '/dashboard/finance/statements') {
            await expect(page.getByTestId('financial-statements-drilldowns')).toBeVisible();
          }
          await expectFitsViewport(page);
          if (width === 390) await page.screenshot({ path: test.info().outputPath(route.replaceAll('/', '-').replaceAll('?', '-') + '.png') });
        });
      }
      expect(errors).toEqual([]);
    });
    test('导航、搜索与商品长表单可触达', async ({ page }) => {
      await signInAsAdmin(page);
      await page.getByRole('button', { name: '更多', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('button', { name: '系统管理', exact: true })).toBeVisible();
      await sheet.getByRole('button', { name: '系统管理', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/settings$/);
      await page.getByRole('button', { name: /搜索商品/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('combobox').fill('不锈钢');
      await expect(page.getByRole('option').first()).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      await page.goto('/dashboard/products');
      await page.getByRole('button', { name: '新增商品', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expectFitsViewport(page);
      const input = dialog.locator('input').first();
      expect(await input.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
      const save = dialog.getByRole('button', { name: /保存|创建|确定/ }).last();
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await page.setViewportSize({ width: 844, height: 390 });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await expectFitsViewport(page);
      await page.setViewportSize({ width, height: 420 });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await expectFitsViewport(page);
    });

    test('财务明细加载后宽账簿在卡片内滚动', async ({ page }) => {
      await signInAsAdmin(page, '/dashboard/finance/statements');
      await expect(page.getByTestId('financial-statements-drilldowns')).toBeVisible();
      const ledger = page.locator('#finance-period-detail table').last();
      await expect(ledger).toBeVisible();
      const container = await ledger.evaluate((table) => {
        const scroller = table.parentElement!;
        const bounds = scroller.getBoundingClientRect();
        scroller.scrollLeft = scroller.scrollWidth;
        return { left: bounds.left, right: bounds.right, scrollLeft: scroller.scrollLeft };
      });
      expect(container.left).toBeGreaterThanOrEqual(0);
      expect(container.right).toBeLessThanOrEqual(width);
      expect(container.scrollLeft).toBeGreaterThan(0);
      await expectFitsViewport(page);
    });
  });
}

test.describe('手机核心操作', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => { await mockApiRoutes(page); });

  test('登录、公共页面与退出', async ({ page }) => {
    for (const route of ['/login', '/register', '/forgot-password']) {
      await page.goto(route);
      await expect(page.locator('form')).toBeVisible();
      if (route === '/register') {
        await expect(page.getByText('邮箱注册', { exact: true })).toBeVisible();
        await page.getByLabel('邮箱', { exact: true }).fill('mobile@example.com');
        const sent = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/v1/auth/email-code' && request.method() === 'POST');
        await page.getByRole('button', { name: '获取验证码', exact: true }).click();
        expect((await sent).postDataJSON()).toEqual({ email: 'mobile@example.com' });
        await expect(page.getByRole('status')).toContainText('验证码已发送');
        await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled();
        await page.getByLabel('邮箱验证码', { exact: true }).fill('123456');
        await page.getByLabel('姓名', { exact: true }).fill('合成手机测试');
        await page.getByLabel('密码', { exact: true }).fill('non-production-preview');
        const submitted = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/v1/auth/email-register' && request.method() === 'POST');
        await page.getByRole('button', { name: '注册并申请开通', exact: true }).click();
        expect((await submitted).postDataJSON()).toMatchObject({ email: 'mobile@example.com', code: '123456', name: '合成手机测试' });
        await expect(page.getByText('注册申请已提交', { exact: true })).toBeVisible();
        await expect(page.getByText('请联系管理员审核开通，开通后可用邮箱和密码登录。')).toBeVisible();
        expect(await page.evaluate(() => sessionStorage.getItem('jiesong_access_token'))).toBeNull();
      }
      await expectFitsViewport(page);
    }
    await page.goto('/login');
    await page.getByRole('textbox').first().fill('mobile-demo');
    await page.locator('input[type="password"]').fill('non-production-preview');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '更多', exact: true }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('出口两步表单、日期选择、必填校验与装箱编辑', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/sales/create');
    await page.getByRole('button', { name: '签订日期', exact: true }).click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
    await expectFitsViewport(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '下一步：出口明细', exact: true }).click();
    await expect(page.getByRole('button', { name: '创建合同', exact: true })).toBeVisible();
    await expectFitsViewport(page);
    await page.getByRole('button', { name: '创建合同', exact: true }).click();
    await expect(page.getByText('请选择商品', { exact: true }).last()).toBeVisible();
    await page.goto('/dashboard/sales/sc-001');
    await page.getByRole('button', { name: '编辑 不锈钢门', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '保存', exact: true }).scrollIntoViewIfNeeded();
    await expectFitsViewport(page);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    for (const name of ['合同信息', '报关信息', '财务结算', '装箱明细']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expectFitsViewport(page);
    }
  });

  test('采购供应商选择与手机档案定位', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/purchase/create');
    await page.getByRole('combobox', { name: '商品 *', exact: true }).click();
    await page.getByRole('option', { name: /不锈钢门/ }).click();
    await page.getByRole('spinbutton', { name: '数量 *', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: '单价 (¥) *', exact: true }).fill('100');
    await page.getByRole('button', { name: '下一步：合同信息', exact: true }).click();
    await page.getByRole('combobox', { name: '供应商 *', exact: true }).click();
    await page.getByRole('combobox', { name: '搜索供应商', exact: true }).fill('供应商A');
    await expectFitsViewport(page);
    await page.getByRole('option', { name: /供应商A/ }).click();
    await expect(page.getByRole('combobox', { name: '供应商 *', exact: true })).toContainText('供应商A');
    await page.goto('/dashboard/suppliers');
    await page.getByRole('button', { name: /供应商A/ }).click();
    await expect(page.getByRole('heading', { name: '供应商档案表单' })).toBeInViewport();
  });

  test('报关退税详情、编辑和手机卡片完整显示', async ({ page }) => {
    await signInAsAdmin(page);
    for (const route of ['/dashboard/customs-declarations/cd-1', '/dashboard/customs-declarations/cd-1/edit', '/dashboard/tax-refunds/tr-1', '/dashboard/tax-refunds/tr-1/edit']) {
      await page.goto(route);
      await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('页面出现异常')).toHaveCount(0);
      await expectFitsViewport(page);
    }
  });
});

test.describe('平板与桌面保持可用', () => {
  for (const width of [768, 1440]) {
    test(`主要页面 ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockApiRoutes(page);
      await signInAsAdmin(page);
      for (const route of ['/dashboard', '/dashboard/contracts', '/dashboard/sales', '/dashboard/settings']) {
        await page.goto(route);
        await expect(page.locator('main').first()).not.toBeEmpty();
        await page.waitForLoadState('networkidle');
        await expectFitsViewport(page);
      }
    });
  }
});

test.describe('手机查阅与异常恢复', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => { await mockApiRoutes(page); });
  test('设置子菜单完整可达并自动收起', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/settings');
    const menu = page.locator('details');
    for (const [label, path] of [['港口管理', 'ports'], ['商品分类', 'categories'], ['报关公司', 'customs-brokers'], ['数据导出', 'export']]) {
      await menu.locator('summary').click();
      await menu.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/settings/${path}$`));
      await expect(menu).not.toHaveAttribute('open');
      await expectFitsViewport(page);
    }
  });
  test('HS 详情内容、夜间模式与返回', async ({ page }) => {
    await signInAsAdmin(page, '/dashboard/hs-codes');
    await page.getByPlaceholder('编码前缀（4–10位）').fill('7308');
    await page.getByRole('button', { name: '查看申报要素与详情', exact: true }).click();
    await expect(page.getByRole('button', { name: '返回列表', exact: true })).toBeVisible();
    await expectFitsViewport(page);
    await page.getByRole('button', { name: '返回列表', exact: true }).click();
    await page.getByRole('button', { name: '切换到夜间模式', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expectFitsViewport(page);
    await page.screenshot({ path: test.info().outputPath('hs-dark.png') });
  });
  test('列表接口失败后能刷新恢复', async ({ page }) => {
    await page.route('**/api/v1/products?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: '验收：暂时不可用' }) }));
    await signInAsAdmin(page, '/dashboard/products');
    await expect(page.getByText('加载商品失败').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible();
    await page.unroute('**/api/v1/products?**');
    await page.reload();
    await expect(page.getByText('不锈钢门', { exact: true }).first()).toBeVisible();
    await expectFitsViewport(page);
  });
});
