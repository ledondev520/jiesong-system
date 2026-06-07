import type { ComponentType } from 'react';
import {
  Bell,
  Landmark,
  LayoutDashboard,
  History,
  PackageOpen,
  ShoppingCart,
  SlidersHorizontal,
  Warehouse,
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
  { href: '/dashboard/reports', label: '经营报表' },
];

export const PROCUREMENT_TABS: TabConfig[] = [
  { href: '/dashboard/contracts', label: '采购合同' },
  { href: '/dashboard/suppliers', label: '供应商管理' },
  { href: '/dashboard/contract-templates', label: '合同模板' },
];

export const EXPORT_TABS: TabConfig[] = [
  { href: '/dashboard/sales', label: '销售合同' },
  { href: '/dashboard/tax-refunds', label: '出口退税' },
];

export const LOGISTICS_TABS: TabConfig[] = [
  { href: '/dashboard/logistics', label: '库存总览' },
  { href: '/dashboard/logistics/containers', label: '货柜装箱' },
  { href: '/dashboard/customs-declarations', label: '报关单' },
  { href: '/dashboard/hs-codes', label: 'HS 编码' },
];

export const FINANCE_TABS: TabConfig[] = [
  { href: '/dashboard/finance', label: '财务概览' },
  { href: '/dashboard/finance/receivable', label: '应收账款' },
  { href: '/dashboard/finance/payable', label: '应付账款' },
  { href: '/dashboard/payments', label: '收付款' },
  { href: '/dashboard/finance/bank-flow', label: '银行流水' },
  { href: '/dashboard/finance/invoices', label: '发票台账' },
  { href: '/dashboard/finance/reconciliation', label: '对账分析' },
];

export const ADMIN_TABS: TabConfig[] = [
  { href: '/dashboard/settings', label: '系统配置' },
  { href: '/dashboard/users', label: '账号管理' },
  { href: '/dashboard/products', label: '商品档案' },
  { href: '/dashboard/system/logs', label: '系统日志' },
  { href: '/dashboard/dev', label: '项目驾驶舱' },
  { href: '/dashboard/about', label: '关于' },
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
    label: '管理工作台',
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
    childPrefixes: ['/dashboard/contracts', '/dashboard/suppliers', '/dashboard/contract-templates'],
    tabs: PROCUREMENT_TABS,
    mobilePrimary: true,
  },
  {
    key: 'export',
    href: '/dashboard/sales',
    defaultHref: '/dashboard/sales',
    label: '销售',
    icon: PackageOpen,
    childPrefixes: ['/dashboard/sales', '/dashboard/tax-refunds', '/forex-verifications'],
    tabs: EXPORT_TABS,
    mobilePrimary: true,
  },
  {
    key: 'logistics',
    href: '/dashboard/logistics',
    defaultHref: '/dashboard/logistics',
    label: '仓储物流',
    icon: Warehouse,
    childPrefixes: ['/dashboard/logistics', '/dashboard/customs-declarations', '/dashboard/hs-codes'],
    tabs: LOGISTICS_TABS,
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
    key: 'admin',
    href: '/dashboard/settings',
    defaultHref: '/dashboard/settings',
    label: '系统管理',
    icon: SlidersHorizontal,
    childPrefixes: [
      '/dashboard/contracts/templates',
      '/dashboard/settings',
      '/dashboard/settings/ports',
      '/dashboard/settings/categories',
      '/dashboard/settings/customs-brokers',
      '/dashboard/import',
      '/dashboard/users',
      '/dashboard/about',
      '/dashboard/system',
      '/dashboard/ai',
      '/dashboard/products',
    ],
    tabs: ADMIN_TABS,
    visibleRoles: [Role.ADMIN],
  },
];

export const SHELL_PREFETCH_ROUTES = [
  '/dashboard/purchase/create',
  '/dashboard/sales/create',
  '/dashboard/tax-refunds/create',
  '/dashboard/customs-declarations/create',
  '/dashboard/contracts',
  '/dashboard/payments',
  '/dashboard/finance/statements',
  '/dashboard/users',
  '/dashboard/system',
] as const;

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
  if (href === '/dashboard/finance') return pathname === '/dashboard/finance';
  return pathname === href || pathname.startsWith(`${href}/`);
};
