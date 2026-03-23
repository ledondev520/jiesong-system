/**
 * Input: Playwright测试运行参数
 * Output: 自动化验收测试配置
 * Pos: 前端E2E测试入口配置
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3004',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run start -- --hostname 127.0.0.1 -p 3004',
    url: 'http://127.0.0.1:3004',
    reuseExistingServer: true,
    timeout: 180000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
