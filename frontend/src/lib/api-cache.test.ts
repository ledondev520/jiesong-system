/**
 * API Cache 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cachedFetch, invalidateCache, clearAllCache } from './api-cache';

describe('api-cache', () => {
  beforeEach(() => {
    clearAllCache();
    vi.useFakeTimers();
  });

  it('应该缓存fetcher的结果', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');

    const result = await cachedFetch('key-1', fetcher);

    expect(result).toBe('data');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('应该返回缓存值而不是重新请求', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');

    await cachedFetch('key-2', fetcher);
    const result = await cachedFetch('key-2', fetcher);

    expect(result).toBe('data');
    expect(fetcher).toHaveBeenCalledTimes(1); // 只调用一次
  });

  it('应该在过期后重新请求', async () => {
    const fetcher = vi.fn().mockResolvedValue('fresh-data');

    await cachedFetch('key-3', fetcher, 1000);

    // 等待过期
    vi.advanceTimersByTime(1500);

    const newFetcher = vi.fn().mockResolvedValue('new-data');
    const result = await cachedFetch('key-3', newFetcher, 1000);

    expect(result).toBe('new-data');
    expect(newFetcher).toHaveBeenCalledTimes(1);
  });

  it('应该失效指定key的缓存', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');

    await cachedFetch('key-4', fetcher);
    invalidateCache('key-4');

    const newFetcher = vi.fn().mockResolvedValue('new-data');
    const result = await cachedFetch('key-4', newFetcher);

    expect(result).toBe('new-data');
    expect(newFetcher).toHaveBeenCalledTimes(1);
  });

  it('应该失效前缀匹配的所有缓存', async () => {
    const fetcher1 = vi.fn().mockResolvedValue('data1');
    const fetcher2 = vi.fn().mockResolvedValue('data2');

    await cachedFetch('/api/users/1', fetcher1);
    await cachedFetch('/api/users/2', fetcher2);

    invalidateCache('/api/users/');

    const newFetcher1 = vi.fn().mockResolvedValue('new-data1');
    const newFetcher2 = vi.fn().mockResolvedValue('new-data2');

    await cachedFetch('/api/users/1', newFetcher1);
    await cachedFetch('/api/users/2', newFetcher2);

    expect(newFetcher1).toHaveBeenCalledTimes(1);
    expect(newFetcher2).toHaveBeenCalledTimes(1);
  });

  it('应该清空所有缓存', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');

    await cachedFetch('key-a', fetcher);
    await cachedFetch('key-b', fetcher);

    clearAllCache();

    const newFetcher = vi.fn().mockResolvedValue('new-data');
    await cachedFetch('key-a', newFetcher);

    expect(newFetcher).toHaveBeenCalledTimes(1);
  });
});
