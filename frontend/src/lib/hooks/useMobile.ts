/**
 * Input: 浏览器窗口尺寸
 * Output: 当前视口是否为移动端（< 768px）的布尔值
 * Pos: 工具 hook，用于条件渲染移动端/桌面端差异化布局
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;

const getMobileSnapshot = () => {
  if (typeof window === 'undefined') return false;

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  }

  return window.innerWidth < MOBILE_BREAKPOINT;
};

const subscribeToMobileChanges = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (typeof window.matchMedia !== 'function') {
    const resizeHandler = () => onStoreChange();
    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }

  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  const handler = () => onStoreChange();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
};

/**
 * 职责：监听窗口宽度变化，返回是否为移动端视口
 * 思路：
 *   1. SSR 阶段返回 false（服务端无法感知客户端视口）
 *   2. 客户端通过 matchMedia 精确监听断点变化，测试环境没有 matchMedia 时回退到 innerWidth
 *   3. 使用 useSyncExternalStore 订阅外部状态，避免 effect 中同步 setState
 * @returns boolean - true 表示当前为移动端视口（< 768px）
 */
export function useMobile(): boolean {
  return useSyncExternalStore(subscribeToMobileChanges, getMobileSnapshot, () => false);
}
