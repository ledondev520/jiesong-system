/**
 * Input: 当前路由路径、搜索关键词
 * Output: Mac 风格设置左侧导航栏（含搜索过滤）
 * Pos: 系统管理 > 设置布局左侧导航
 */

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  SlidersHorizontal,
  Users,
  Anchor,
  Tag,
  Building2,
  Download,
  History,
  Search,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: '通用',
    items: [
      { href: '/dashboard/settings', label: '系统配置', icon: SlidersHorizontal },
      { href: '/dashboard/settings/users', label: '用户管理', icon: Users },
    ],
  },
  {
    label: '基础数据',
    items: [
      { href: '/dashboard/settings/ports', label: '港口管理', icon: Anchor },
      { href: '/dashboard/settings/categories', label: '商品分类', icon: Tag },
      { href: '/dashboard/settings/customs-brokers', label: '报关公司', icon: Building2 },
    ],
  },
  {
    label: '数据工具',
    items: [
      { href: '/dashboard/settings/export', label: '数据导出', icon: Download },
    ],
  },
  {
    label: '运维中心',
    items: [
      { href: '/dashboard/system/logs', label: '系统日志', icon: History },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard/settings') {
    return pathname === '/dashboard/settings';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav() {
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return navGroups;
    const q = query.toLowerCase();
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      {/* 搜索 */}
      <div className="px-3 pb-4 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索设置项..."
            className="h-9 rounded-lg border-border/60 bg-background pl-8 text-sm shadow-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 导航分组 */}
      <div className="flex-1 space-y-5 overflow-auto px-3 pb-4">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            <nav className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/80 hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="flex-1">{item.label}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-primary/70" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </div>
  );
}
