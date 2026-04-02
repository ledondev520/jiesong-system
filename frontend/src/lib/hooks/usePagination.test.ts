/**
 * usePagination Hook 单元测试
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePagination } from './usePagination';

describe('usePagination', () => {
  it('应该使用默认值初始化', () => {
    const { result } = renderHook(() => usePagination(100));

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.total).toBe(100);
    expect(result.current.totalPages).toBe(5);
  });

  it('应该使用自定义初始值', () => {
    const { result } = renderHook(() => usePagination(100, { pageSize: 10, initialPage: 2 }));

    expect(result.current.page).toBe(2);
    expect(result.current.pageSize).toBe(10);
    expect(result.current.totalPages).toBe(10);
  });

  it('应该计算正确的start和end', () => {
    const { result } = renderHook(() => usePagination(100, { pageSize: 20, initialPage: 2 }));

    expect(result.current.start).toBe(20);
    expect(result.current.end).toBe(40);
  });

  it('应该切换到下一页', () => {
    const { result } = renderHook(() => usePagination(100));

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.page).toBe(2);
    expect(result.current.isFirstPage).toBe(false);
  });

  it('应该切换到上一页', () => {
    const { result } = renderHook(() => usePagination(100, { initialPage: 3 }));

    act(() => {
      result.current.prevPage();
    });

    expect(result.current.page).toBe(2);
  });

  it('不应该超过最后一页', () => {
    const { result } = renderHook(() => usePagination(50, { pageSize: 10 }));

    act(() => {
      result.current.setPage(10);
    });

    expect(result.current.page).toBe(5);
    expect(result.current.isLastPage).toBe(true);
  });

  it('不应该小于第一页', () => {
    const { result } = renderHook(() => usePagination(100, { initialPage: 3 }));

    act(() => {
      result.current.setPage(0);
    });

    expect(result.current.page).toBe(1);
    expect(result.current.isFirstPage).toBe(true);
  });

  it('应该修改pageSize并重置到第一页', () => {
    const { result } = renderHook(() => usePagination(100, { initialPage: 3 }));

    act(() => {
      result.current.setPageSize(50);
    });

    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(2);
  });

  it('应该重置到初始状态', () => {
    const { result } = renderHook(() => usePagination(100, { pageSize: 10, initialPage: 5 }));

    act(() => {
      result.current.setPageSize(25);
      result.current.setPage(3);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(10);
  });

  it('应该处理空数据', () => {
    const { result } = renderHook(() => usePagination(0));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.isLastPage).toBe(true);
  });
});
