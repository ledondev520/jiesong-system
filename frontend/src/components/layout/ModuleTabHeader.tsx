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
  AI_TABS,
  EXPORT_TABS,
  FINANCE_TABS,
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
      <nav className="flex items-end gap-0 overflow-x-auto scrollbar-none" aria-label={moduleName}>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'relative flex min-h-[44px] items-center px-4 py-2.5 text-sm font-medium transition-colors',
              'hover:text-foreground',
              isTabRouteActive(pathname, tab.href)
                ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
