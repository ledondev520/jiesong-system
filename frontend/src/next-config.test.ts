/**
 * Input: Next.js headers 配置
 * Output: 开发环境不把可变编译块强制标记为 immutable
 * Pos: 认证页与业务页热更一致性回归测试
 */

import { describe, expect, it, vi } from 'vitest';
import nextConfig from '../next.config';

describe('next.config headers', () => {
  it('不覆盖 Next.js 对 _next/static 的环境感知缓存策略', async () => {
    const headers = typeof nextConfig.headers === 'function'
      ? await nextConfig.headers()
      : [];
    const staticRule = headers.find((rule) => rule.source === '/_next/static/(.*)');

    expect(staticRule).toBeUndefined();
  });

  it('后端地址及完整 API 地址生成同一个代理，不重复 /api/v1', async () => {
    try {
      for (const base of ['https://backend.example', 'https://backend.example/api/v1/']) {
        vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', base);
        vi.resetModules();
        const config = (await import('../next.config')).default;
        const rewrites = typeof config.rewrites === 'function' ? await config.rewrites() : [];
        expect(rewrites).toEqual([{ source: '/api/v1/:path*', destination: 'https://backend.example/api/v1/:path*' }]);
      }
    } finally { vi.unstubAllEnvs(); }
  });
});
