/**
 * Input: useFormHandler hook
 * Output: 提交流程成功/失败行为测试
 * Pos: 前端 hooks 测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFormHandler } from './useFormHandler';

describe('useFormHandler', () => {
  it('提交成功时回调 onSuccess 并清空错误', async () => {
    const onSubmit = vi.fn(async () => {});
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useFormHandler<{ name: string }>({
        onSubmit,
        onSuccess,
        onError,
      }),
    );

    await act(async () => {
      await result.current.submit({ name: '测试' });
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: '测试' });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  it('提交失败时可映射错误并调用 onError，resetError 可清理', async () => {
    const onError = vi.fn();
    const onSubmit = vi.fn(async () => {
      throw new Error('raw error');
    });

    const { result } = renderHook(() =>
      useFormHandler<{ id: number }>({
        onSubmit,
        onError,
        mapError: () => 'mapped error',
      }),
    );

    await act(async () => {
      await result.current.submit({ id: 1 });
    });

    expect(onError).toHaveBeenCalledWith('mapped error');
    expect(result.current.error).toBe('mapped error');
    expect(result.current.isSubmitting).toBe(false);

    act(() => {
      result.current.resetError();
    });
    expect(result.current.error).toBeNull();
  });
});
