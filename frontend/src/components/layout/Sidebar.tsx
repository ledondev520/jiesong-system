/**
 * Input: 导航配置、用户认证状态
 * Output: 侧边栏导航组件
 * Pos: 全局布局组件，提供5个核心导航入口
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
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

/**
 * 简化后的导航菜单配置（5个核心入口）
 * - 工作台：快速录入 + 待办 + 概览
 * - 合同管理：采购合同 + 出口合同（Tab切换）
 * - 库存状态：商品库存跟踪
 * - 收付款：应付 + 应收（Tab切换）
 * - 设置：基础档案 + 用户 + 系统配置 + 数据导入
 */
const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/contracts', label: '合同管理', icon: FileText },
  { href: '/dashboard/inventory-container', label: '库存状态', icon: Warehouse },
  { href: '/dashboard/payments', label: '收付款', icon: DollarSign },
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
    <div className="flex h-full w-64 flex-col border-r bg-card text-card-foreground">
      {/* 0. Logo区域 */}
      <div className="flex h-14 items-center border-b px-4 font-semibold text-lg">
        捷淞进销存
      </div>
      
      {/* 1. 导航菜单 */}
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActiveItem(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:text-primary',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      
      {/* 2. 退出登录 */}
      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
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
