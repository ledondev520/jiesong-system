import type { ComponentType } from 'react';
import {
  Bell,
  Bot,
  Landmark,
  LayoutDashboard,
  History,
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

export interface SystemCenterLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  desc: string;
  detail: string;
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
  mobilePrimary?: boolean;
}

export const OPERATIONS_TABS: TabConfig[] = [
  { href: '/dashboard', label: '工作台' },
  { href: '/dashboard/reports', label: '经营执行' },
];

export const PROCUREMENT_TABS: TabConfig[] = [
  { href: '/dashboard/contracts', label: '采购合同' },
  { href: '/dashboard/suppliers', label: '供应商管理' },
  { href: '/dashboard/inventory-status', label: '库存状态' },
];

export const EXPORT_TABS: TabConfig[] = [
  { href: '/dashboard/sales', label: '出口合同' },
  { href: '/dashboard/tax-refunds', label: '出口退税' },
  { href: '/dashboard/hs-codes', label: 'HS 编码' },
];

export const FINANCE_TABS: TabConfig[] = [
  { href: '/dashboard/finance', label: '财务概览' },
  { href: '/dashboard/finance/statements', label: '财务报表' },
  { href: '/dashboard/payments', label: '收付管理' },
];

export const AI_TABS: TabConfig[] = [
  { href: '/dashboard/ai', label: '开始对话' },
  { href: '/dashboard/ai/sessions', label: '会话记录' },
];

export const ADMIN_TABS: TabConfig[] = [
  { href: '/dashboard/settings', label: '系统配置' },
  { href: '/dashboard/users', label: '账号管理' },
  { href: '/dashboard/products', label: '商品档案' },
  { href: '/dashboard/system/logs', label: '系统日志' },
];

export const SYSTEM_CENTER_LINKS: SystemCenterLink[] = [
  {
    href: '/dashboard/system/notifications',
    label: '通知中心',
    icon: Bell,
    desc: '查看系统通知和未读提醒',
    detail: '管理所有系统消息、操作提醒与告警通知，支持批量已读。',
  },
  {
    href: '/dashboard/system/logs',
    label: '系统日志',
    icon: History,
    desc: '审计关键操作日志与变更记录',
    detail: '追踪合同创建/修改/删除、数据导入等关键操作，支持 CSV 导出。',
  },
];

export const MODULE_NAV_ITEMS: ModuleNavItem[] = [
  {
    key: 'operations',
    href: '/dashboard',
    defaultHref: '/dashboard',
    label: '经营中台',
    icon: LayoutDashboard,
    childPrefixes: ['/dashboard/reports'],
    tabs: OPERATIONS_TABS,
    mobilePrimary: true,
  },
  {
    key: 'procurement',
    href: '/dashboard/contracts',
    defaultHref: '/dashboard/contracts',
    label: '采购',
    icon: ShoppingCart,
    childPrefixes: ['/dashboard/contracts', '/dashboard/suppliers', '/dashboard/inventory-status', '/dashboard/logistics'],
    tabs: PROCUREMENT_TABS,
    mobilePrimary: true,
  },
  {
    key: 'export',
    href: '/dashboard/sales',
    defaultHref: '/dashboard/sales',
    label: '出口',
    icon: PackageOpen,
    childPrefixes: [
      '/dashboard/sales',
      '/dashboard/tax-refunds',
      '/dashboard/customs-declarations',
      '/dashboard/hs-codes',
      '/forex-verifications',
    ],
    tabs: EXPORT_TABS,
    mobilePrimary: true,
  },
  {
    key: 'finance',
    href: '/dashboard/finance',
    defaultHref: '/dashboard/finance',
    label: '财务',
    icon: Landmark,
    childPrefixes: ['/dashboard/payments', '/dashboard/finance'],
    tabs: FINANCE_TABS,
    mobilePrimary: true,
  },
  {
    key: 'ai',
    href: '/dashboard/ai',
    defaultHref: '/dashboard/ai',
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
    childPrefixes: [
      '/dashboard/settings',
      '/dashboard/settings/ports',
      '/dashboard/settings/categories',
      '/dashboard/settings/customs-brokers',
      '/dashboard/import',
      '/dashboard/users',
      '/dashboard/about',
      '/dashboard/system',
      '/dashboard/dev',
      '/dashboard/products',
    ],
    tabs: ADMIN_TABS,
    visibleRoles: [Role.ADMIN],
  },
];

export const getVisibleModuleNavItems = (role?: Role | null) =>
  MODULE_NAV_ITEMS.filter((item) => !item.visibleRoles || (role ? item.visibleRoles.includes(role) : false));

export const getPrimaryMobileModuleNavItems = (role?: Role | null) =>
  getVisibleModuleNavItems(role).filter((item) => item.mobilePrimary);

export const getSecondaryMobileModuleNavItems = (role?: Role | null) =>
  getVisibleModuleNavItems(role).filter((item) => !item.mobilePrimary);

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

export const isTabRouteActive = (pathname: string | null, href: string) => {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/dashboard/contracts') {
    return pathname === '/dashboard/contracts' || pathname.startsWith('/dashboard/contracts/');
  }
  if (href === '/dashboard/inventory-status') {
    return (
      pathname === '/dashboard/inventory-status' ||
      pathname.startsWith('/dashboard/inventory-status/') ||
      pathname === '/dashboard/logistics' ||
      pathname.startsWith('/dashboard/logistics/')
    );
  }
  if (href === '/dashboard/tax-refunds') {
    return (
      pathname === '/dashboard/tax-refunds' ||
      pathname.startsWith('/dashboard/tax-refunds/') ||
      pathname === '/dashboard/customs-declarations' ||
      pathname.startsWith('/dashboard/customs-declarations/')
    );
  }
  if (href === '/dashboard/finance') return pathname === '/dashboard/finance';
  if (href === '/dashboard/payments') {
    return [
      '/dashboard/payments',
      '/dashboard/finance/receivable',
      '/dashboard/finance/payable',
      '/dashboard/finance/bank-flow',
      '/dashboard/finance/invoices',
      '/dashboard/finance/reconciliation',
    ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};
