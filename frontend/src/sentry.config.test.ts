/**
 * Input: Sentry config entrypoints
 * Output: 配置文件可导入性测试
 * Pos: 前端构建期依赖回归测试
 */

import { describe, expect, it } from 'vitest';

describe('Sentry config imports', () => {
  it('imports client config', async () => {
    await expect(import('../sentry.client.config')).resolves.toBeDefined();
  });

  it('imports server config', async () => {
    await expect(import('../sentry.server.config')).resolves.toBeDefined();
  });

  it('imports edge config', async () => {
    await expect(import('../sentry.edge.config')).resolves.toBeDefined();
  });
});
