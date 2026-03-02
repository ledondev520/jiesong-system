/**
 * Input: useApi hook
 * Output: 通用异步请求状态机测试
 * Pos: 前端 hooks 测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApi } from './useApi';

describe('useApi', () => {
  it('execute 成功时更新 data/loading/hasLoaded 并调用 onSuccess', async () => {
    const request = vi.fn(async (id: number) => ({ id, name: 'demo' }));
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useApi(request, {
        onSuccess,
      }),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.hasLoaded).toBe(false);

    await act(async () => {
      const response = await result.current.execute(7);
      expect(response).toEqual({ id: 7, name: 'demo' });
    });

    expect(request).toHaveBeenCalledWith(7);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({ id: 7, name: 'demo' });
    expect(onSuccess).toHaveBeenCalledWith({ id: 7, name: 'demo' });
  });

  it('execute 失败时返回 null 并规范化错误信息', async () => {
    const onError = vi.fn();
    const request = vi.fn(async () => {
      throw 'boom';
    });

    const { result } = renderHook(() =>
      useApi(request, {
        onError,
      }),
    );

    await act(async () => {
      const response = await result.current.execute();
      expect(response).toBeNull();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.error).toBe('boom');
    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('immediate=true 会在挂载后自动请求', async () => {
    const request = vi.fn(async () => 42);

    const { result } = renderHook(() =>
      useApi(request, {
        immediate: true,
        initialData: 0,
      }),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(0);

    await waitFor(() => {
      expect(result.current.hasLoaded).toBe(true);
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe(42);
  });
});
