/**
 * API Error 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError, parseApiError, isNetworkError, fetchWithRetry, createApiWrapper } from './api-error';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('ApiError', () => {
  it('应该创建ApiError实例', () => {
    const error = new ApiError('test error', 500, true, false);

    expect(error.message).toBe('test error');
    expect(error.status).toBe(500);
    expect(error.isNetworkError).toBe(true);
    expect(error.isTimeout).toBe(false);
    expect(error.name).toBe('ApiError');
  });
});

describe('parseApiError', () => {
  it('应该解析401错误', async () => {
    const response = new Response('', { status: 401 });
    const error = await parseApiError(response);

    expect(error.status).toBe(401);
    expect(error.message).toContain('登录');
  });

  it('应该解析403错误', async () => {
    const response = new Response('', { status: 403 });
    const error = await parseApiError(response);

    expect(error.status).toBe(403);
    expect(error.message).toContain('权限');
  });

  it('应该解析404错误', async () => {
    const response = new Response('', { status: 404 });
    const error = await parseApiError(response);

    expect(error.status).toBe(404);
    expect(error.message).toContain('不存在');
  });

  it('应该解析500错误', async () => {
    const response = new Response('', { status: 500 });
    const error = await parseApiError(response);

    expect(error.status).toBe(500);
    expect(error.message).toContain('服务器');
  });
});

describe('isNetworkError', () => {
  it('应该识别网络错误', () => {
    const error = new TypeError('Failed to fetch');
    expect(isNetworkError(error)).toBe(true);
  });

  it('应该识别ApiError网络错误', () => {
    const error = new ApiError('network error', undefined, true, false);
    expect(isNetworkError(error)).toBe(true);
  });

  it('应该返回false对于普通错误', () => {
    const error = new Error('normal error');
    expect(isNetworkError(error)).toBe(false);
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该成功执行请求', async () => {
    const fetchFn = vi.fn().mockResolvedValue('success');

    const result = await fetchWithRetry(fetchFn, { showToast: false });

    expect(result).toBe('success');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('应该重试失败后抛出错误', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchWithRetry(fetchFn, { showToast: false, maxRetries: 2 })).rejects.toThrow('Failed to fetch');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe('createApiWrapper', () => {
  it('应该创建包装函数', async () => {
    const wrapper = createApiWrapper({ showToast: false });
    const fetchFn = vi.fn().mockResolvedValue('data');

    const result = await wrapper(fetchFn);

    expect(result).toBe('data');
  });
});
