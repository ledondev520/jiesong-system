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

// ==================== Tab 配置常量 ====================

export interface TabConfig {
  href: string;
  label: string;
}

/** 经营中台：工作台 | 经营执行 | 库存状态 */
export const OPERATIONS_TABS: TabConfig[] = [
  { href: '/dashboard', label: '工作台' },
  { href: '/dashboard/ops-execution', label: '经营执行' },
  { href: '/dashboard/inventory-container', label: '库存状态' },
];

/** 采购模块：采购合同 | 商家管理 */
export const PROCUREMENT_TABS: TabConfig[] = [
  { href: '/dashboard/contracts', label: '采购合同' },
  { href: '/dashboard/suppliers', label: '商家管理' },
];

/** 出口模块：出口合同 | 出口退税 | 报关单 | HS 编码 */
export const EXPORT_TABS: TabConfig[] = [
  { href: '/dashboard/sales', label: '出口合同' },
  { href: '/dashboard/tax-refunds', label: '出口退税' },
  { href: '/customs-declarations', label: '报关单' },
  { href: '/dashboard/hs-codes', label: 'HS 编码' },
];

/** 财务模块：财务报表 | 收付管理 */
export const FINANCE_TABS: TabConfig[] = [
  { href: '/dashboard/finance/statements', label: '财务报表' },
  { href: '/dashboard/payments', label: '收付管理' },
];

/** AI 模块：AI 会话 */
export const AI_TABS: TabConfig[] = [
  { href: '/dashboard/ai/sessions', label: 'AI 会话' },
];

/** 系统管理：系统配置 | 用户管理 | 通知中心 | 系统日志 | 导入记录 | 合同模板 */
export const ADMIN_TABS: TabConfig[] = [
  { href: '/dashboard/settings', label: '系统配置' },
  { href: '/dashboard/users', label: '用户管理' },
  { href: '/dashboard/system/notifications', label: '通知中心' },
  { href: '/dashboard/system/logs', label: '系统日志' },
  { href: '/dashboard/system/import-records', label: '导入记录' },
  { href: '/dashboard/contracts/templates', label: '合同模板' },
];

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

  /**
   * 职责：判断某个Tab是否激活
   * 思路：工作台（/dashboard）使用精确匹配，其他使用前缀匹配
   */
  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

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
              isActive(tab.href)
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
