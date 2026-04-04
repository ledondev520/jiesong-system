/**
 * 职责：列表批量操作 Hook
 * 思路：管理选中项状态，支持全选、反选、批量操作
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseBatchSelectionOptions<T> {
  items: T[];
  getItemId: (item: T) => string;
  maxSelection?: number;
}

export interface BatchSelectionState<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isAllSelected: boolean;
  isPartialSelected: boolean;
  selectedCount: number;
  isOverLimit: boolean;
}

export interface BatchSelectionActions {
  toggleSelection: (id: string) => void;
  setSelection: (id: string, selected: boolean) => void;
  selectAll: () => void;
  unselectAll: () => void;
  invertSelection: () => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

export function useBatchSelection<T>(
  options: UseBatchSelectionOptions<T>
): [BatchSelectionState<T>, BatchSelectionActions] {
  const { items, getItemId, maxSelection } = options;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedItems = useMemo(() => {
    return items.filter((item) => selectedIds.has(getItemId(item)));
  }, [items, selectedIds, getItemId]);

  const isAllSelected = useMemo(() => {
    return items.length > 0 && items.every((item) => selectedIds.has(getItemId(item)));
  }, [items, selectedIds, getItemId]);

  const isPartialSelected = useMemo(() => {
    return selectedIds.size > 0 && !isAllSelected;
  }, [selectedIds.size, isAllSelected]);

  const isOverLimit = useMemo(() => {
    return maxSelection !== undefined && selectedIds.size > maxSelection;
  }, [selectedIds.size, maxSelection]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (maxSelection !== undefined && next.size >= maxSelection) {
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }, [maxSelection]);

  const setSelection = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        if (maxSelection !== undefined && next.size >= maxSelection) {
          return prev;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, [maxSelection]);

  const selectAll = useCallback(() => {
    if (maxSelection !== undefined) {
      const idsToSelect = items.slice(0, maxSelection).map(getItemId);
      setSelectedIds(new Set(idsToSelect));
    } else {
      const allIds = items.map(getItemId);
      setSelectedIds(new Set(allIds));
    }
  }, [items, getItemId, maxSelection]);

  const unselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const invertSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      items.forEach((item) => {
        const id = getItemId(item);
        if (!prev.has(id)) {
          if (maxSelection === undefined || next.size < maxSelection) {
            next.add(id);
          }
        }
      });
      return next;
    });
  }, [items, getItemId, maxSelection]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  const state: BatchSelectionState<T> = {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartialSelected,
    selectedCount: selectedIds.size,
    isOverLimit,
  };

  const actions: BatchSelectionActions = {
    toggleSelection,
    setSelection,
    selectAll,
    unselectAll,
    invertSelection,
    clearSelection,
    isSelected,
  };

  return [state, actions];
}
