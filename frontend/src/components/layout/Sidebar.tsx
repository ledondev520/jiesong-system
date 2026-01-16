'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  TrendingUp,
  Warehouse,
  Container,
  DollarSign,
  Settings,
  LogOut,
  FileBarChart,
  History
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/products', label: '商品管理', icon: Package },
  { href: '/suppliers', label: '供应商', icon: Users },
  { href: '/purchase', label: '采购管理', icon: ShoppingCart },
  { href: '/sales', label: '销售管理', icon: TrendingUp },
  { href: '/inventory', label: '库存管理', icon: Warehouse },
  { href: '/containers', label: '货柜管理', icon: Container },
  { href: '/finance', label: '财务管理', icon: DollarSign },
  { href: '/reports', label: '报表统计', icon: FileBarChart },
  { href: '/users', label: '用户管理', icon: Users }, // Admin only usually
  { href: '/settings', label: '系统设置', icon: Settings },
  { href: '/logs', label: '操作日志', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card text-card-foreground">
      <div className="flex h-14 items-center border-b px-4 font-semibold text-lg">
        捷淞进销存系统
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid gap-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href) || (item.href === '/dashboard' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary',
                  isActive
                    ? 'bg-muted text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
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
