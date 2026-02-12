/**
 * Input: next-themes ThemeProvider
 * Output: 全局主题提供器（支持亮色/暗色切换）
 * Pos: 布局基础组件，为全应用提供主题上下文
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * 职责：为应用注入主题上下文
 * 思路：
 * 1. 使用 class 模式管理主题（light/dark）
 * 2. 默认跟随系统，允许用户手动切换后持久化
 * @param children 需要被主题系统包裹的子节点
 * @returns 主题提供器组件
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
