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

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// ==================== Tab 配置常量 ====================

export interface TabConfig {
  href: string;
  label: string;
}

/** 经营中台：工作台 | 库存状态 */
export const OPERATIONS_TABS: TabConfig[] = [
  { href: '/dashboard', label: '工作台' },
  { href: '/dashboard/inventory-container', label: '库存状态' },
];

/** 采购模块：采购合同 | 采购建议 */
export const PROCUREMENT_TABS: TabConfig[] = [
  { href: '/dashboard/contracts', label: '采购合同' },
  { href: '/dashboard/store-recommend', label: '采购建议' },
];

/** 出口模块：出口合同 | 出口退税 | 报关单 */
export const EXPORT_TABS: TabConfig[] = [
  { href: '/dashboard/sales', label: '出口合同' },
  { href: '/dashboard/tax-refunds', label: '出口退税' },
  { href: '/customs-declarations', label: '报关单' },
];

/** 财务模块：经营执行 | 收付款 | 财务报表 */
export const FINANCE_TABS: TabConfig[] = [
  { href: '/dashboard/ops-execution', label: '经营执行' },
  { href: '/dashboard/payments', label: '收付款' },
  { href: '/dashboard/finance/statements', label: '财务报表' },
];

/** 系统管理：AI 管理 | 合同模板 | 基础设置 */
export const ADMIN_TABS: TabConfig[] = [
  { href: '/dashboard/ai/sessions', label: 'AI 管理' },
  { href: '/dashboard/contracts/templates', label: '合同模板' },
  { href: '/dashboard/settings', label: '基础设置' },
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
      <nav className="flex items-end gap-0" aria-label={moduleName}>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'relative flex items-center px-4 py-2.5 text-sm font-medium transition-colors',
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
