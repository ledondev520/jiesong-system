import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.locator('input[placeholder*="用户名"]').fill('admin');
  await page.locator('input[type="password"]').fill('123456');
  await page.locator('button:has-text("登录")').click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // 打开搜索并输入2个字符
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(800);
  await page.locator('[cmdk-input]').fill('灯具');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/cmdk-search-result2.png' });
  console.log('search result2 screenshot done');

  await browser.close();
})();
