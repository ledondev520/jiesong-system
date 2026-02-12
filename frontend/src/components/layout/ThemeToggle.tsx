/**
 * Input: next-themes useTheme、按钮组件、图标
 * Output: 主题切换按钮（白天/夜间）
 * Pos: 顶部Header交互组件，负责主题切换入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

/**
 * 职责：切换明暗主题
 * 思路：
 * 1. 挂载后再读取主题，避免SSR水合不一致
 * 2. dark -> light / 其他 -> dark
 * @returns 主题切换按钮
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // 0. 挂载后再渲染主题相关UI，避免水合警告
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full border border-border/60 bg-background/50"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? '切换到白天模式' : '切换到夜间模式'}
      aria-label={isDark ? '切换到白天模式' : '切换到夜间模式'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
