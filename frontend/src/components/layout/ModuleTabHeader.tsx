/**
 * Input: 模块Tab配置数组、当前路由
 * Output: 模块内水平Tab导航栏（点击切换子页面）
 * Pos: 通用布局组件，给各业务模块提供统一的Tab切换导航
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 使用方式：
 *   import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
 *   // 在页面顶部渲染：
 *   <ModuleTabHeader tabs={PROCUREMENT_TABS} />
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { saveModuleTab } from '@/lib/tab-memory';
import { isTabRouteActive, type TabConfig } from './navigation.config';

export {
  ADMIN_TABS,
  EXPORT_TABS,
  FINANCE_TABS,
  LOGISTICS_TABS,
  OPERATIONS_TABS,
  PROCUREMENT_TABS,
} from './navigation.config';

// ==================== 组件 ====================

interface ModuleTabHeaderProps {
  tabs: TabConfig[];
  /** 模块名称（用于辅助识别，显示在 Tab 栏左侧） */
  moduleName?: string;
}

/**
 * 职责：渲染模块内水平 Tab 导航栏
 * 思路：
 *   1. 根据当前路由判断哪个 Tab 处于激活状态（前缀匹配，工作台使用精确匹配）
 *   2. 激活 Tab 显示底部色条高亮
 *   3. 点击 Tab 导航至对应子页面
 */
export function ModuleTabHeader({ tabs, moduleName }: ModuleTabHeaderProps) {
  const pathname = usePathname();

  // 0. 每次路径变化时，将当前 URL 存入模块记忆（以第一个 tab 的 href 为模块 key）
  useEffect(() => {
    if (tabs.length > 0) {
      saveModuleTab(tabs[0].href, pathname);
    }
  }, [pathname, tabs]);

  return (
    <div className="mb-6 border-b">
      <nav
        className="flex flex-wrap items-end gap-2 overflow-visible pb-2 scrollbar-none md:flex-nowrap md:gap-0 md:overflow-x-auto md:pb-0"
        aria-label={moduleName}
        /* 移动端横向滚动时不触发页面纵向滚动 */
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {tabs.map((tab) => {
          const active = isTabRouteActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative flex min-h-[40px] items-center whitespace-nowrap rounded-lg border border-border/60 bg-background px-3 py-2',
                'text-sm font-medium transition-colors md:min-h-[44px] md:rounded-none md:border-transparent md:bg-transparent md:px-4',
                'hover:text-foreground',
                active
                  ? 'border-primary/30 bg-primary/10 text-foreground md:border-transparent md:bg-transparent after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-t-full after:bg-primary'
                  : 'text-muted-foreground',
              )}
            >
              {/* 激活状态加粗，提高移动端识别度 */}
              <span className={cn(active && 'font-semibold')}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
