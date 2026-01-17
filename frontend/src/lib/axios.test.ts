/**
 * Input: axios配置与环境变量
 * Output: axios实例创建与拦截器配置测试
 * Pos: 前端HTTP客户端测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';

let requestUse: ReturnType<typeof vi.fn>;
let responseUse: ReturnType<typeof vi.fn>;

vi.mock('axios', () => {
  requestUse = vi.fn();
  responseUse = vi.fn();
  const create = vi.fn(() => ({
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  }));
  return { default: { create } };
});

describe('api axios config', () => {
  it('使用默认baseURL并注册拦截器', async () => {
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    vi.resetModules();
    const axiosModule = await import('axios');
    await import('./axios');

    expect(axiosModule.default.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:3000/api/v1',
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(requestUse).toHaveBeenCalled();
    expect(responseUse).toHaveBeenCalled();

    if (originalEnv) process.env.NEXT_PUBLIC_API_URL = originalEnv;
  });

  it('使用环境变量覆盖baseURL', async () => {
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://example.com/api';

    vi.resetModules();
    const axiosModule = await import('axios');
    await import('./axios');

    expect(axiosModule.default.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://example.com/api',
      }),
    );

    if (originalEnv) {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
  });
});
