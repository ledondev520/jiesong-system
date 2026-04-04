/**
 * Idempotent Request 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runIdempotentRequest, buildIdempotencyKey } from './idempotentRequest';

describe('idempotentRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('应该成功执行请求', async () => {
    const runner = vi.fn().mockResolvedValue('success');

    const result = await runIdempotentRequest('key-1', runner);

    expect(result).toBe('success');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('应该缓存相同键的请求', async () => {
    const runner = vi.fn().mockResolvedValue('cached');

    const promise1 = runIdempotentRequest('key-2', runner);
    const promise2 = runIdempotentRequest('key-2', runner);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe('cached');
    expect(result2).toBe('cached');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('应该在错误后清除缓存', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('failed'));

    await expect(runIdempotentRequest('key-3', runner)).rejects.toThrow('failed');

    // 错误后应该可以重新执行
    const newRunner = vi.fn().mockResolvedValue('retry-success');
    const result = await runIdempotentRequest('key-3', newRunner);

    expect(result).toBe('retry-success');
    expect(newRunner).toHaveBeenCalledTimes(1);
  });

  it('应该使用缓存值当未过期', async () => {
    const runner = vi.fn().mockResolvedValue('fresh');

    // 第一次请求
    await runIdempotentRequest('key-4', runner, { ttlMs: 5000 });

    // 在同一窗口期内再次请求
    const newRunner = vi.fn().mockResolvedValue('new-value');
    const result = await runIdempotentRequest('key-4', newRunner, { ttlMs: 5000 });

    // 应该返回缓存值，而不是执行新runner
    expect(result).toBe('fresh');
    expect(newRunner).not.toHaveBeenCalled();
  });

  it('应该在过期后重新执行', async () => {
    const runner = vi.fn().mockResolvedValue('expired');

    // 第一次请求
    await runIdempotentRequest('key-5', runner, { ttlMs: 1000 });

    // 等待过期
    vi.advanceTimersByTime(1500);

    // 再次请求
    const newRunner = vi.fn().mockResolvedValue('new-value');
    const result = await runIdempotentRequest('key-5', newRunner, { ttlMs: 1000 });

    expect(result).toBe('new-value');
    expect(newRunner).toHaveBeenCalledTimes(1);
  });
});

describe('buildIdempotencyKey', () => {
  it('应该为字符串构建key', () => {
    const key = buildIdempotencyKey('simple-key');
    expect(key).toBe('idempotency:simple-key');
  });

  it('应该为对象构建key', () => {
    const key = buildIdempotencyKey({ a: 1, b: 2 });
    expect(key).toContain('idempotency:');
  });

  it('应该为对象生成一致的key', () => {
    const key1 = buildIdempotencyKey({ b: 2, a: 1 });
    const key2 = buildIdempotencyKey({ a: 1, b: 2 });
    expect(key1).toBe(key2);
  });
});
