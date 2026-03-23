import type { ComponentType } from 'react';
import {
  Bot,
  Landmark,
  LayoutDashboard,
  PackageOpen,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react';
import { getModuleTabOrRoot } from '@/lib/tab-memory';
import { Role } from '@/types';

export interface TabConfig {
  href: string;
  label: string;
}

export interface ModuleNavItem {
  key: string;
  href: string;
  defaultHref: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  childPrefixes: string[];
  tabs: TabConfig[];
  visibleRoles?: Role[];
}

export const OPERATIONS_TABS: TabConfig[] = [
  { href: '/dashboard', label: '工作台' },
  { href: '/dashboard/ops-execution', label: '经营执行' },
];

export const PROCUREMENT_TABS: TabConfig[] = [
  { href: '/dashboard/contracts', label: '采购合同' },
  { href: '/dashboard/suppliers', label: '供应商管理' },
  { href: '/dashboard/inventory-container', label: '库存状态' },
  { href: '/dashboard/store-recommend', label: '采购建议' },
];

export const EXPORT_TABS: TabConfig[] = [
  { href: '/dashboard/sales', label: '出口合同' },
  { href: '/dashboard/tax-refunds', label: '出口退税' },
  { href: '/customs-declarations', label: '报关单' },
  { href: '/dashboard/hs-codes', label: 'HS 编码' },
];

export const FINANCE_TABS: TabConfig[] = [
  { href: '/dashboard/finance', label: '财务概览' },
  { href: '/dashboard/finance/statements', label: '财务报表' },
  { href: '/dashboard/payments', label: '收付管理' },
];

export const AI_TABS: TabConfig[] = [
  { href: '/dashboard/ai/sessions', label: 'AI 会话' },
];

export const ADMIN_TABS: TabConfig[] = [
  { href: '/dashboard/settings', label: '系统配置' },
  { href: '/dashboard/users', label: '用户管理' },
  { href: '/dashboard/system/notifications', label: '通知中心' },
  { href: '/dashboard/system/logs', label: '系统日志' },
  { href: '/dashboard/system/import-records', label: '导入记录' },
  { href: '/dashboard/contracts/templates', label: '合同模板' },
];

export const MODULE_NAV_ITEMS: ModuleNavItem[] = [
  {
    key: 'operations',
    href: '/dashboard',
    defaultHref: '/dashboard',
    label: '经营中台',
    icon: LayoutDashboard,
    childPrefixes: ['/dashboard/ops-execution'],
    tabs: OPERATIONS_TABS,
  },
  {
    key: 'procurement',
    href: '/dashboard/contracts',
    defaultHref: '/dashboard/contracts',
    label: '采购',
    icon: ShoppingCart,
    childPrefixes: ['/dashboard/contracts', '/dashboard/suppliers', '/dashboard/inventory-container', '/dashboard/store-recommend'],
    tabs: PROCUREMENT_TABS,
  },
  {
    key: 'export',
    href: '/dashboard/sales',
    defaultHref: '/dashboard/sales',
    label: '出口',
    icon: PackageOpen,
    childPrefixes: ['/dashboard/sales', '/dashboard/tax-refunds', '/customs-declarations', '/dashboard/hs-codes'],
    tabs: EXPORT_TABS,
  },
  {
    key: 'finance',
    href: '/dashboard/finance',
    defaultHref: '/dashboard/finance',
    label: '财务',
    icon: Landmark,
    childPrefixes: ['/dashboard/payments', '/dashboard/finance'],
    tabs: FINANCE_TABS,
  },
  {
    key: 'ai',
    href: '/dashboard/ai/sessions',
    defaultHref: '/dashboard/ai/sessions',
    label: 'AI 助手',
    icon: Bot,
    childPrefixes: ['/dashboard/ai'],
    tabs: AI_TABS,
  },
  {
    key: 'admin',
    href: '/dashboard/settings',
    defaultHref: '/dashboard/settings',
    label: '系统管理',
    icon: SlidersHorizontal,
    childPrefixes: ['/dashboard/contracts/templates', '/dashboard/settings', '/dashboard/import', '/dashboard/users', '/dashboard/system'],
    tabs: ADMIN_TABS,
    visibleRoles: [Role.ADMIN],
  },
];

export const SHELL_PREFETCH_ROUTES = [
  '/dashboard/purchase/create',
  '/dashboard/sales/create',
  '/dashboard/tax-refunds/create',
  '/customs-declarations/create',
  '/dashboard/contracts',
  '/dashboard/payments',
  '/dashboard/finance/statements',
  '/dashboard/users',
  '/dashboard/system',
] as const;

export const getVisibleModuleNavItems = (role?: Role | null) =>
  MODULE_NAV_ITEMS.filter((item) => !item.visibleRoles || (role ? item.visibleRoles.includes(role) : false));

export const getDefaultDashboardHref = (role?: Role | null) =>
  getVisibleModuleNavItems(role)[0]?.defaultHref ?? '/dashboard';

export const getModuleTargetHref = (item: Pick<ModuleNavItem, 'href' | 'defaultHref' | 'childPrefixes'>) => {
  const remembered = getModuleTabOrRoot(item.href, item.childPrefixes);
  return remembered === item.href ? item.defaultHref : remembered;
};

export const isModuleRouteActive = (pathname: string, item: Pick<ModuleNavItem, 'href' | 'childPrefixes'>) => {
  if (pathname === '/dashboard') {
    return item.href === '/dashboard';
  }

  return [item.href, ...item.childPrefixes].some((prefix) => {
    if (prefix === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
};

export const getModuleByPath = (pathname: string) =>
  MODULE_NAV_ITEMS.find((item) => isModuleRouteActive(pathname, item));

export const isTabRouteActive = (pathname: string, href: string) => {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/dashboard/finance') return pathname === '/dashboard/finance';
  return pathname === href || pathname.startsWith(`${href}/`);
};
