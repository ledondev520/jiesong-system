/**
 * Input: 浏览器窗口尺寸
 * Output: 当前视口是否为移动端（< 768px）的布尔值
 * Pos: 工具 hook，用于条件渲染移动端/桌面端差异化布局
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * 职责：监听窗口宽度变化，返回是否为移动端视口
 * 思路：
 *   1. SSR 阶段返回 false（服务端无法感知客户端视口）
 *   2. 客户端挂载后通过 matchMedia 精确监听断点变化
 *   3. 使用 matchMedia 而非 resize 事件，避免频繁触发
 * @returns boolean - true 表示当前为移动端视口（< 768px）
 */
export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    // 1. 监听断点变化
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);

    // 0. 通过 handler 触发初始状态同步（避免在 effect body 内直接 setState）
    handler({ matches: mql.matches } as MediaQueryListEvent);

    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
