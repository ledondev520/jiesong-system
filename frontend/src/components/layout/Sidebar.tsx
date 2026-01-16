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
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/suppliers', label: 'Suppliers', icon: Users },
  { href: '/purchase', label: 'Purchase', icon: ShoppingCart },
  { href: '/sales', label: 'Sales', icon: TrendingUp },
  { href: '/inventory', label: 'Inventory', icon: Warehouse },
  { href: '/containers', label: 'Containers', icon: Container },
  { href: '/finance', label: 'Finance', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card text-card-foreground">
      <div className="flex h-14 items-center border-b px-4 font-semibold">
        Jiesong System
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
                    ? 'bg-muted text-primary'
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
          className="w-full justify-start gap-2"
          onClick={() => {
            logout();
            window.location.href = '/login';
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
