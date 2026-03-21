/**
 * Input: axios配置与环境变量
 * Output: axios实例创建与拦截器配置测试
 * Pos: 前端HTTP客户端测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let requestUse: ReturnType<typeof vi.fn>;
let responseUse: ReturnType<typeof vi.fn>;
let mockInstance: {
  defaults: { baseURL: string };
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  interceptors: {
    request: { use: ReturnType<typeof vi.fn> };
    response: { use: ReturnType<typeof vi.fn> };
  };
} | null = null;

vi.mock('axios', () => {
  requestUse = vi.fn();
  responseUse = vi.fn();
  mockInstance = {
    defaults: { baseURL: '/api/v1' },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  };
  const create = vi.fn(() => ({
    ...mockInstance,
  }));
  return { default: { create } };
});

describe('api axios config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance?.get.mockReset();
    mockInstance?.post.mockReset();
    mockInstance?.put.mockReset();
    mockInstance?.patch.mockReset();
    mockInstance?.delete.mockReset();
  });

  it('使用默认baseURL并注册拦截器', async () => {
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    const originalBaseEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    vi.resetModules();
    const axiosModule = await import('axios');
    await import('./axios');

    expect(axiosModule.default.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: '/api/v1', // 使用Next.js代理路径
        timeout: 60000, // 更新后的超时时间
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(requestUse).toHaveBeenCalled();
    expect(responseUse).toHaveBeenCalled();

    if (originalEnv) process.env.NEXT_PUBLIC_API_URL = originalEnv;
    if (originalBaseEnv) {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseEnv;
    }
  });

  it('使用环境变量覆盖baseURL', async () => {
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    const originalBaseEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://example.com/api';
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

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

    if (originalBaseEnv) {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseEnv;
    }
  });

  it('优先使用 NEXT_PUBLIC_API_BASE_URL', async () => {
    const originalEnv = process.env.NEXT_PUBLIC_API_URL;
    const originalBaseEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://legacy.example.com/api';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://current.example.com/api';

    vi.resetModules();
    const axiosModule = await import('axios');
    await import('./axios');

    expect(axiosModule.default.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://current.example.com/api',
      }),
    );

    if (originalEnv) {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }

    if (originalBaseEnv) {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseEnv;
    } else {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    }
  });

  it('相同 GET 请求会命中缓存并复用并发请求', async () => {
    vi.resetModules();
    await import('axios');
    mockInstance!.get.mockResolvedValue({ code: 200, data: { items: [1] } });
    const { default: api, clearApiGetCache } = await import('./axios');
    clearApiGetCache();

    const [first, second] = await Promise.all([
      api.get('/products', { params: { keyword: 'abc', page: 1 } }),
      api.get('/products', { params: { page: 1, keyword: 'abc' } }),
    ]);
    const third = await api.get('/products', { params: { keyword: 'abc', page: 1 } });

    expect(mockInstance!.get).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it('写操作后会清空 GET 缓存', async () => {
    vi.resetModules();
    await import('axios');
    mockInstance!.get
      .mockResolvedValueOnce({ code: 200, data: { items: ['before'] } })
      .mockResolvedValueOnce({ code: 200, data: { items: ['after'] } });
    mockInstance!.post.mockResolvedValue({ code: 200, data: null });
    const { default: api, clearApiGetCache } = await import('./axios');
    clearApiGetCache();

    await api.get('/products');
    await api.get('/products');
    expect(mockInstance!.get).toHaveBeenCalledTimes(1);

    await api.post('/products', { name: 'n1' });
    await api.get('/products');

    expect(mockInstance!.get).toHaveBeenCalledTimes(2);
  });
});
