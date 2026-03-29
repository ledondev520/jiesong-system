/**
 * Input: useMobile hook
 * Output: 移动端断点判断回归测试
 * Pos: 前端 hooks 测试
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobile } from './useMobile';

describe('useMobile', () => {
  const originalInnerWidth = window.innerWidth;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      // jsdom 默认没有 matchMedia，清掉测试中临时注入的实现
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('在测试环境没有 matchMedia 时使用 innerWidth 作为回退', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 640,
      writable: true,
    });

    const { result } = renderHook(() => useMobile());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('当 matchMedia 可用时仍能正常运行', async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener,
        matches: false,
        media: '(max-width: 767px)',
        removeEventListener,
      })),
      writable: true,
    });

    const { result } = renderHook(() => useMobile());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeEventListener).not.toHaveBeenCalled();
  });
});
