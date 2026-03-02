/**
 * Input: useDataTable hook
 * Output: 过滤/排序/分页联动测试
 * Pos: 前端 hooks 测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDataTable } from './useDataTable';

interface Item {
  id: number;
  name: string;
  active: boolean;
}

describe('useDataTable', () => {
  const data: Item[] = [
    { id: 1, name: 'c', active: true },
    { id: 2, name: 'a', active: true },
    { id: 3, name: 'b', active: false },
    { id: 4, name: 'd', active: true },
    { id: 5, name: 'e', active: true },
  ];

  it('按条件过滤并排序，同时输出首屏分页记录', () => {
    const { result } = renderHook(() =>
      useDataTable<Item>({
        data,
        pageSize: 2,
        filter: (item) => item.active,
        sort: (a, b) => a.name.localeCompare(b.name),
      }),
    );

    expect(result.current.filtered.map((item) => item.name)).toEqual(['a', 'c', 'd', 'e']);
    expect(result.current.records.map((item) => item.name)).toEqual(['a', 'c']);
    expect(result.current.page).toBe(1);
    expect(result.current.total).toBe(4);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.start).toBe(0);
    expect(result.current.end).toBe(2);
  });

  it('分页操作能正确切换页数据', () => {
    const { result } = renderHook(() =>
      useDataTable<Item>({
        data,
        pageSize: 2,
        filter: (item) => item.active,
        sort: (a, b) => a.name.localeCompare(b.name),
      }),
    );

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.page).toBe(2);
    expect(result.current.records.map((item) => item.name)).toEqual(['d', 'e']);
    expect(result.current.start).toBe(2);
    expect(result.current.end).toBe(4);

    act(() => {
      result.current.setPageSize(3);
    });

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.records.map((item) => item.name)).toEqual(['a', 'c', 'd']);
  });
});
