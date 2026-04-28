/**
 * Input: 泛型数组数据 + 可选默认排序
 * Output: 排序状态管理、排序后数据、排序回调
 * Pos: 通用 hook，任何表格页面可直接使用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { useState, useMemo, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortState<K extends string = string> {
  key: K | null;
  dir: SortDirection;
}

export interface UseTableSortResult<T, K extends string = string> {
  sortedData: T[];
  sortKey: K | null;
  sortDir: SortDirection;
  onSort: (key: K) => void;
  resetSort: () => void;
}

/**
 * 职责：通用表格排序 hook，三态切换（升序 → 降序 → 取消）
 * 思路：
 *   1. 维护 sortKey + sortDir 状态
 *   2. 点击同一列循环 asc → desc → null
 *   3. 点击不同列重置为 asc
 *   4. 用 useMemo 对数据排序避免重复计算
 * @param data - 原始数据数组
 * @param accessor - 根据 key 返回排序值的函数
 * @param defaultSort - 可选默认排序
 */
export function useTableSort<T, K extends string = string>(
  data: T[],
  accessor: (item: T, key: K) => string | number | null | undefined,
  defaultSort?: { key: K; dir: SortDirection }
): UseTableSortResult<T, K> {
  const [sortKey, setSortKey] = useState<K | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSort?.dir ?? null);

  /**
   * 职责：点击列头时切换排序方向（asc → desc → 取消）
   */
  const onSort = useCallback((key: K) => {
    setSortKey((prevKey) => {
      if (prevKey !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir((prevDir) => {
        if (prevDir === 'asc') return 'desc';
        if (prevDir === 'desc') return null;
        return 'asc';
      });
      return key;
    });
  }, []);

  const resetSort = useCallback(() => {
    setSortKey(null);
    setSortDir(null);
  }, []);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return data;

    return [...data].sort((a, b) => {
      const va = accessor(a, sortKey);
      const vb = accessor(b, sortKey);

      if (va == null && vb == null) return 0;
      if (va == null) return sortDir === 'asc' ? 1 : -1;
      if (vb == null) return sortDir === 'asc' ? -1 : 1;

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }

      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      const cmp = sa.localeCompare(sb, 'zh-CN');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, accessor]);

  return { sortedData, sortKey, sortDir, onSort, resetSort };
}
