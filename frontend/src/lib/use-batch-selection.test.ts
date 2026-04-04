/**
 * useBatchSelection Hook 单元测试
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBatchSelection } from './use-batch-selection';

describe('useBatchSelection', () => {
  const mockItems = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  it('应该正确初始化状态', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    const [state] = result.current;

    expect(state.selectedIds.size).toBe(0);
    expect(state.selectedItems).toEqual([]);
    expect(state.isAllSelected).toBe(false);
    expect(state.isPartialSelected).toBe(false);
    expect(state.selectedCount).toBe(0);
    expect(state.isOverLimit).toBe(false);
  });

  it('应该切换选中状态', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].toggleSelection('1');
    });

    expect(result.current[0].selectedIds.has('1')).toBe(true);
    expect(result.current[0].selectedItems).toHaveLength(1);

    act(() => {
      result.current[1].toggleSelection('1');
    });

    expect(result.current[0].selectedIds.has('1')).toBe(false);
    expect(result.current[0].selectedItems).toHaveLength(0);
  });

  it('应该设置选中状态', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].setSelection('1', true);
    });

    expect(result.current[0].selectedIds.has('1')).toBe(true);
    expect(result.current[1].isSelected('1')).toBe(true);

    act(() => {
      result.current[1].setSelection('1', false);
    });

    expect(result.current[0].selectedIds.has('1')).toBe(false);
    expect(result.current[1].isSelected('1')).toBe(false);
  });

  it('应该全选和取消全选', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].selectAll();
    });

    expect(result.current[0].selectedIds.size).toBe(3);
    expect(result.current[0].isAllSelected).toBe(true);

    act(() => {
      result.current[1].unselectAll();
    });

    expect(result.current[0].selectedIds.size).toBe(0);
    expect(result.current[0].isAllSelected).toBe(false);
  });

  it('应该反选', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].setSelection('1', true);
      result.current[1].invertSelection();
    });

    expect(result.current[0].selectedIds.has('1')).toBe(false);
    expect(result.current[0].selectedIds.has('2')).toBe(true);
    expect(result.current[0].selectedIds.has('3')).toBe(true);
  });

  it('应该清空选择', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].selectAll();
      result.current[1].clearSelection();
    });

    expect(result.current[0].selectedIds.size).toBe(0);
  });

  it('应该检测部分选中状态', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].setSelection('1', true);
    });

    expect(result.current[0].isPartialSelected).toBe(true);
    expect(result.current[0].isAllSelected).toBe(false);
  });

  it('应该支持最大选择限制', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: mockItems,
      getItemId: (item) => item.id,
      maxSelection: 2,
    }));

    act(() => {
      result.current[1].setSelection('1', true);
      result.current[1].setSelection('2', true);
      result.current[1].setSelection('3', true);
    });

    expect(result.current[0].selectedIds.size).toBe(2);
    expect(result.current[0].isOverLimit).toBe(false);
  });

  it('应该处理空列表', () => {
    const { result } = renderHook(() => useBatchSelection({
      items: [] as Array<{ id: string; name: string }>,
      getItemId: (item) => item.id,
    }));

    act(() => {
      result.current[1].selectAll();
    });

    expect(result.current[0].selectedIds.size).toBe(0);
    expect(result.current[0].isAllSelected).toBe(false);
  });
});
