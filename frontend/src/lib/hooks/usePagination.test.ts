/**
 * Input: usePagination hook
 * Output: 分页状态与边界行为测试
 * Pos: 前端 hooks 测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePagination } from './usePagination';

describe('usePagination', () => {
  it('初始化分页元信息并计算起止区间', () => {
    const { result } = renderHook(() =>
      usePagination(45, {
        pageSize: 10,
        initialPage: 2,
      }),
    );

    expect(result.current.page).toBe(2);
    expect(result.current.pageSize).toBe(10);
    expect(result.current.total).toBe(45);
    expect(result.current.totalPages).toBe(5);
    expect(result.current.start).toBe(10);
    expect(result.current.end).toBe(20);
    expect(result.current.isFirstPage).toBe(false);
    expect(result.current.isLastPage).toBe(false);
  });

  it('setPage 会做上下限收敛并忽略非法输入', () => {
    const { result } = renderHook(() => usePagination(45, { pageSize: 10 }));

    act(() => {
      result.current.setPage(99);
    });
    expect(result.current.page).toBe(5);

    act(() => {
      result.current.setPage(0);
    });
    expect(result.current.page).toBe(1);

    act(() => {
      result.current.setPage(3);
      result.current.setPage(Number.NaN);
    });
    expect(result.current.page).toBe(3);
  });

  it('next/prev 与 setPageSize/reset 行为正确', () => {
    const { result } = renderHook(() =>
      usePagination(21, {
        pageSize: 10,
      }),
    );

    act(() => {
      result.current.prevPage();
    });
    expect(result.current.page).toBe(1);

    act(() => {
      result.current.nextPage();
    });
    act(() => {
      result.current.nextPage();
    });
    act(() => {
      result.current.nextPage();
    });
    expect(result.current.page).toBe(3);
    expect(result.current.isLastPage).toBe(true);

    act(() => {
      result.current.setPageSize(5);
    });
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(5);
    expect(result.current.totalPages).toBe(5);

    act(() => {
      result.current.reset();
    });
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(10);
  });
});
