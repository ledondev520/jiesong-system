/**
 * Input: 导航配置、用户认证状态
 * Output: 侧边栏导航组件
 * Pos: 全局布局组件，提供6个核心导航入口
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard,
  FileText,
  Warehouse,
  DollarSign,
  Settings,
  LogOut,
  Ship,
  Store,
  History,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

/**
 * 导航菜单配置（6个核心入口）
 * - 工作台：快速录入 + 待办 + 概览
 * - 采购合同：采购合同管理
 * - 出口合同：出口合同管理（独立页面，方便返回）
 * - 库存状态：商品库存跟踪
 * - 收付款：应付 + 应收（Tab切换）
 * - 设置：基础档案 + 用户 + 系统配置 + 数据导入
 * - 系统日志：操作日志列表
 */
const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/contracts', label: '采购合同', icon: FileText, exact: true },
  { href: '/dashboard/sales', label: '出口合同', icon: Ship },
  { href: '/dashboard/inventory-container', label: '库存状态', icon: Warehouse },
  { href: '/dashboard/payments', label: '收付款', icon: DollarSign },
  { href: '/dashboard/store-recommend', label: '采购建议', icon: Store },
  { href: '/dashboard/system/logs', label: '系统日志', icon: History },
  { href: '/dashboard/settings', label: '设置', icon: Settings },
];

/**
 * 职责：渲染侧边栏导航
 * 思路：
 *   1. 遍历navItems渲染导航链接
 *   2. 根据当前路径高亮活跃菜单
 *   3. 提供退出登录功能
 */
export function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  /**
   * 判断菜单是否活跃
   * @param item 导航项配置
   * @returns 是否高亮
   */
  const isActiveItem = (item: typeof navItems[0]) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-sidebar-border/80 bg-sidebar/75 text-sidebar-foreground backdrop-blur-xl">
      {/* 0. Logo区域 */}
      <div className="flex h-16 items-center border-b border-sidebar-border/80 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-brand-emphasis flex h-9 w-9 items-center justify-center rounded-xl border border-accent/30 bg-accent/15">
            JS
          </div>
          <div className="min-w-0">
            <p className="text-brand-emphasis truncate text-sm font-semibold tracking-[0.18em]">JIESONG</p>
            <p className="truncate text-xs text-sidebar-foreground/65">Business Control Center</p>
          </div>
        </div>
      </div>
      
      {/* 1. 导航菜单 */}
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1.5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveItem(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                  isActive
                    ? 'bg-sidebar-primary/18 text-sidebar-primary font-medium shadow-[inset_0_0_0_1px_oklch(0.76_0.07_248_/_0.32)]'
                    : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      
      {/* 2. 退出登录 */}
      <div className="border-t border-sidebar-border/80 p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/40 text-sidebar-foreground/72 hover:text-destructive"
          onClick={() => {
            logout();
            window.location.href = '/login';
          }}
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </Button>
      </div>
    </div>
  );
}
