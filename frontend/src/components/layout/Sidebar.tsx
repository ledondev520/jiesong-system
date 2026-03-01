/**
 * Input: 用户认证状态、路由信息
 * Output: 侧边导航栏组件
 * Pos: 全局布局组件，提供系统导航功能
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * 
 * 导航结构：
 * - 工作台：系统首页
 * - 采购合同：采购合同管理
 * - 出口合同：销售合同管理
 * - 库存状态：商品库存跟踪
 * - 收付款：应付 + 应收（Tab 切换）
 * - 采购建议：AI 智能推荐
 * - AI 管理：AI 会话/用量/模型（阶段 3）
 * - 合同模板：模板上传/管理（阶段 4）
 * - 系统运维：通知/日志/导入记录
 * - 数据配置：港口/商品分类（阶段 5）
 * - 设置：基础档案 + 用户 + 系统配置
 */

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard,
  FileText,
  Ship,
  Warehouse,
  DollarSign,
  Store,
  Bot,
  FileBox,
  Bell,
  History,
  Database,
  Settings,
  LogOut,
  Globe,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/contracts', label: '采购合同', icon: FileText, exact: true },
  { href: '/dashboard/sales', label: '出口合同', icon: Ship },
  { href: '/dashboard/inventory-container', label: '库存状态', icon: Warehouse },
  { href: '/dashboard/payments', label: '收付款', icon: DollarSign },
  { href: '/dashboard/store-recommend', label: '采购建议', icon: Store },
  
  // 阶段 3 - AI 管理
  { href: '/dashboard/ai/sessions', label: 'AI 管理', icon: Bot },
  
  // 阶段 4 - 合同模板
  { href: '/dashboard/contracts/templates', label: '合同模板', icon: FileBox },
  
  // 阶段 2 - 系统运维
  { href: '/dashboard/system/notifications', label: '通知中心', icon: Bell },
  { href: '/dashboard/system/logs', label: '系统日志', icon: History, adminOnly: true },
  { href: '/dashboard/system/import-records', label: '导入记录', icon: Database, adminOnly: true },
  
  // 阶段 5 - 数据域配置
  { href: '/dashboard/settings/ports', label: '港口管理', icon: Globe },
  { href: '/dashboard/settings/categories', label: '商品分类', icon: Database },
  
  { href: '/dashboard/settings', label: '设置', icon: Settings },
];

/**
 * 职责：渲染侧边导航栏
 * 思路：
 * 1. 过滤管理员专属导航项
 * 2. 根据当前路由高亮激活项
 * 3. 渲染导航链接和退出按钮
 */
export function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const isActiveItem = (item: typeof navItems[0]) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Ship className="h-6 w-6" />
          <span>捷淞系统</span>
        </Link>
      </div>

      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1 px-2">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                isActiveItem(item)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/72 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          <span>退出登录</span>
        </Button>
      </div>
    </div>
  );
}
