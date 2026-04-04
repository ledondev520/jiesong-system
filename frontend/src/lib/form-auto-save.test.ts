/**
 * Form Auto-Save Hook 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormAutoSave, cleanupExpiredDrafts } from './form-auto-save';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/test-page',
}));

// Mock localStorage
const localStorageMock: Storage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('useFormAutoSave', () => {
  const formId = 'test-form';
  const formValues = { name: 'John', email: 'john@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该初始化状态', () => {
    vi.mocked(localStorageMock.getItem).mockReturnValue(null);

    const { result } = renderHook(() =>
      useFormAutoSave(formValues, { formId })
    );

    expect(result.current.hasDraft).toBe(false);
    expect(result.current.lastSaved).toBe(null);
  });

  it('应该检测到存在的草稿', () => {
    const draft = JSON.stringify({
      values: formValues,
      meta: { timestamp: Date.now(), pathname: '/test-page' },
    });
    vi.mocked(localStorageMock.getItem).mockReturnValue(draft);

    const { result } = renderHook(() =>
      useFormAutoSave(formValues, { formId })
    );

    expect(result.current.hasDraft).toBe(true);
  });

  it('应该自动保存到 localStorage', async () => {
    vi.mocked(localStorageMock.getItem).mockReturnValue(null);
    const onSave = vi.fn();

    const { rerender } = renderHook(
      ({ values }) => useFormAutoSave(values, { formId, interval: 1000, onSave }),
      { initialProps: { values: formValues } }
    );

    // 更新表单值
    const newValues = { ...formValues, name: 'Jane' };
    rerender({ values: newValues });

    // 等待自动保存
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(localStorageMock.setItem).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
  });

  it('应该恢复草稿', () => {
    const savedValues = { name: 'Saved', email: 'saved@example.com' };
    const draft = JSON.stringify({
      values: savedValues,
      meta: { timestamp: Date.now(), pathname: '/test-page' },
    });
    vi.mocked(localStorageMock.getItem).mockReturnValue(draft);

    const { result } = renderHook(() =>
      useFormAutoSave(formValues, { formId })
    );

    const restored = result.current.restoreDraft();
    expect(restored).toEqual(savedValues);
  });

  it('应该清除草稿', () => {
    vi.mocked(localStorageMock.getItem).mockReturnValue(null);

    const { result } = renderHook(() =>
      useFormAutoSave(formValues, { formId })
    );

    act(() => {
      result.current.clearDraft();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith(`form_draft_${formId}`);
  });

  it('应该获取草稿信息', () => {
    const timestamp = Date.now();
    const draft = JSON.stringify({
      values: formValues,
      meta: { timestamp, pathname: '/test-page' },
    });
    vi.mocked(localStorageMock.getItem).mockReturnValue(draft);

    const { result } = renderHook(() =>
      useFormAutoSave(formValues, { formId })
    );

    const info = result.current.getDraftInfo();
    expect(info).toEqual({ timestamp, pathname: '/test-page' });
  });

  it('应该调用验证回调', () => {
    vi.mocked(localStorageMock.getItem).mockReturnValue(null);
    const validateBeforeSave = vi.fn(() => false);

    const { rerender } = renderHook(
      ({ values }) => useFormAutoSave(values, { formId, interval: 1000, validateBeforeSave }),
      { initialProps: { values: formValues } }
    );

    const newValues = { ...formValues, name: 'Jane' };
    rerender({ values: newValues });

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(validateBeforeSave).toHaveBeenCalled();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

describe('cleanupExpiredDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该清理过期草稿', () => {
    const now = Date.now();
    const expiredDraft = JSON.stringify({
      values: { name: 'Expired' },
      meta: { timestamp: now - 8 * 24 * 60 * 60 * 1000, pathname: '/old' },
    });

    vi.mocked(localStorageMock.key).mockReturnValue('form_draft_old');
    vi.mocked(localStorageMock.getItem).mockReturnValue(expiredDraft);
    Object.defineProperty(localStorageMock, 'length', { value: 1, writable: true });

    cleanupExpiredDrafts(7);

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('form_draft_old');
  });

  it('应该保留未过期草稿', () => {
    const now = Date.now();
    const validDraft = JSON.stringify({
      values: { name: 'Valid' },
      meta: { timestamp: now - 3 * 24 * 60 * 60 * 1000, pathname: '/recent' },
    });

    vi.mocked(localStorageMock.key).mockReturnValue('form_draft_recent');
    vi.mocked(localStorageMock.getItem).mockReturnValue(validDraft);
    Object.defineProperty(localStorageMock, 'length', { value: 1, writable: true });

    cleanupExpiredDrafts(7);

    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
