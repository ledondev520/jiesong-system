/**
 * Input: Next.js headers 配置
 * Output: 开发环境不把可变编译块强制标记为 immutable
 * Pos: 认证页与业务页热更一致性回归测试
 */

import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('next.config headers', () => {
  it('不覆盖 Next.js 对 _next/static 的环境感知缓存策略', async () => {
    const headers = typeof nextConfig.headers === 'function'
      ? await nextConfig.headers()
      : [];
    const staticRule = headers.find((rule) => rule.source === '/_next/static/(.*)');

    expect(staticRule).toBeUndefined();
  });
});
