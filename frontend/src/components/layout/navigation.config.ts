import type { ComponentType } from "react";
import {
  Bell,
  Bot,
  Boxes,
  FileCheck2,
  FileText,
  Home,
  Landmark,
  History,
  PackageOpen,
  Package,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Users,
  Barcode,
} from "lucide-react";
import { Role } from "@/types";

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

export type NavGroup = "main" | "business" | "data" | "system";

export const NAV_GROUP_LABELS: Record<NavGroup, string | null> = {
  main: null,
  business: "业务",
  data: "资料",
  system: null,
};

export interface ModuleNavItem {
  key: string;
  href: string;
  defaultHref: string;
  label: string;
  /** 手机底栏短标签，缺省用 label */
  mobileLabel?: string;
  icon: ComponentType<{ className?: string }>;
  childPrefixes: string[];
  /** 侧栏中该项激活时展开的子页面（沿用现有 URL） */
  children: TabConfig[];
  group: NavGroup;
  /** 不出现在侧栏/底栏，但仍用于路由归属与角色拦截（页面尚未上线或无菜单入口） */
  hidden?: boolean;
  visibleRoles?: Role[];
  mobilePrimary?: boolean;
}

export const ADMIN_TABS: TabConfig[] = [
  { href: "/dashboard/settings", label: "系统配置" },
  { href: "/dashboard/users", label: "账号管理" },
  { href: "/dashboard/system/logs", label: "系统日志" },
];

export const SYSTEM_CENTER_LINKS: SystemCenterLink[] = [
  {
    href: "/dashboard/system/notifications",
    label: "通知中心",
    icon: Bell,
    desc: "查看系统通知和未读提醒",
    detail: "管理所有系统消息、操作提醒与告警通知，支持批量已读。",
  },
  {
    href: "/dashboard/system/logs",
    label: "系统日志",
    icon: History,
    desc: "审计关键操作日志与变更记录",
    detail: "追踪合同创建/修改/删除、数据导入等关键操作，支持 CSV 导出。",
  },
];

// 菜单指向现有 URL（URL 迁移见后续 IA 卡片）。报价、客户与门店页面上线前 hidden。
export const MODULE_NAV_ITEMS: ModuleNavItem[] = [
  {
    key: "home",
    href: "/dashboard",
    defaultHref: "/dashboard",
    label: "首页",
    icon: Home,
    childPrefixes: [],
    children: [],
    group: "main",
    mobilePrimary: true,
  },
  {
    key: "quotes",
    href: "/dashboard/quotes",
    defaultHref: "/dashboard/quotes",
    label: "报价",
    icon: FileText,
    childPrefixes: [],
    children: [],
    group: "business",
    hidden: true,
  },
  {
    key: "orders",
    href: "/dashboard/orders",
    defaultHref: "/dashboard/orders",
    label: "出口订单",
    mobileLabel: "订单",
    icon: PackageOpen,
    // 详情/新建在 J18/J19 迁到 /orders/* 之前仍在 /dashboard/sales/*
    childPrefixes: ["/dashboard/sales"],
    children: [],
    group: "business",
    mobilePrimary: true,
  },
  {
    key: "purchases",
    href: "/dashboard/contracts",
    defaultHref: "/dashboard/contracts",
    label: "采购",
    icon: ShoppingCart,
    childPrefixes: ["/dashboard/purchase"],
    children: [],
    group: "business",
    mobilePrimary: true,
  },
  {
    key: "inventory",
    href: "/dashboard/inventory-status",
    defaultHref: "/dashboard/inventory-status",
    label: "库存",
    icon: Boxes,
    childPrefixes: ["/dashboard/logistics"],
    children: [],
    group: "business",
    mobilePrimary: true,
  },
  {
    key: "documents",
    href: "/dashboard/customs-declarations",
    defaultHref: "/dashboard/customs-declarations",
    label: "单证与退税",
    icon: FileCheck2,
    childPrefixes: ["/dashboard/tax-refunds"],
    children: [
      { href: "/dashboard/customs-declarations", label: "报关单" },
      { href: "/dashboard/tax-refunds", label: "出口退税" },
    ],
    group: "business",
  },
  {
    key: "finance",
    href: "/dashboard/finance",
    defaultHref: "/dashboard/finance",
    label: "财务",
    icon: Landmark,
    childPrefixes: ["/dashboard/payments", "/dashboard/reports"],
    children: [
      { href: "/dashboard/finance", label: "财务概览" },
      { href: "/dashboard/finance/statements", label: "财务报表" },
      { href: "/dashboard/payments", label: "收付管理" },
      { href: "/dashboard/reports", label: "经营执行" },
    ],
    group: "business",
  },
  {
    key: "customers",
    href: "/dashboard/customers",
    defaultHref: "/dashboard/customers",
    label: "客户与门店",
    icon: Users,
    childPrefixes: [],
    children: [],
    group: "data",
    hidden: true,
  },
  {
    key: "suppliers",
    href: "/dashboard/suppliers",
    defaultHref: "/dashboard/suppliers",
    label: "供应商",
    icon: Truck,
    childPrefixes: [],
    children: [],
    group: "data",
  },
  // PURCHASE 经此入口维护商品档案；API 权限仍由后端 roleAuth 决定，菜单不授予权限。
  {
    key: "products",
    href: "/dashboard/products",
    defaultHref: "/dashboard/products",
    label: "商品",
    icon: Package,
    childPrefixes: [],
    children: [],
    group: "data",
  },
  {
    key: "hs-codes",
    href: "/dashboard/hs-codes",
    defaultHref: "/dashboard/hs-codes",
    label: "HS 编码",
    icon: Barcode,
    childPrefixes: [],
    children: [],
    group: "data",
  },
  // AI 由顶栏按钮进入（后续侧栏面板），不设菜单项；保留以便路由归属与 BOSS 拦截。
  {
    key: "ai",
    href: "/dashboard/ai",
    defaultHref: "/dashboard/ai",
    label: "AI 助手",
    icon: Bot,
    childPrefixes: ["/dashboard/ai"],
    children: [],
    group: "system",
    hidden: true,
  },
  // 通知从顶栏铃铛进入；BOSS 无其他系统入口，仅保留路由归属。
  {
    key: "notifications",
    href: "/dashboard/system/notifications",
    defaultHref: "/dashboard/system/notifications",
    label: "通知中心",
    icon: Bell,
    childPrefixes: [],
    children: [],
    group: "system",
    hidden: true,
    visibleRoles: [Role.BOSS],
  },
  {
    key: "admin",
    href: "/dashboard/settings",
    defaultHref: "/dashboard/settings",
    label: "设置",
    icon: SlidersHorizontal,
    childPrefixes: [
      "/dashboard/settings",
      "/dashboard/settings/ports",
      "/dashboard/settings/categories",
      "/dashboard/settings/customs-brokers",
      "/dashboard/import",
      "/dashboard/users",
      "/dashboard/about",
      "/dashboard/system",
    ],
    children: ADMIN_TABS,
    group: "system",
    visibleRoles: [Role.ADMIN],
  },
];

// 含 hidden 项：路由归属与角色拦截使用。
export const getVisibleModuleNavItems = (role?: Role | null) =>
  MODULE_NAV_ITEMS.filter(
    (item) =>
      (role !== Role.BOSS || item.key !== "ai") &&
      (!item.visibleRoles || (role ? item.visibleRoles.includes(role) : false)),
  );

// 侧栏/底栏实际展示的菜单项。
export const getMenuNavItems = (role?: Role | null) =>
  getVisibleModuleNavItems(role).filter((item) => !item.hidden);

export const getPrimaryMobileModuleNavItems = (role?: Role | null) =>
  getMenuNavItems(role).filter((item) => item.mobilePrimary);

export const getSecondaryMobileModuleNavItems = (role?: Role | null) =>
  getMenuNavItems(role).filter((item) => !item.mobilePrimary);

export const getDefaultDashboardHref = (role?: Role | null) =>
  getVisibleModuleNavItems(role)[0]?.defaultHref ?? "/dashboard";

export const isModuleRouteActive = (
  pathname: string,
  item: Pick<ModuleNavItem, "href" | "childPrefixes">,
) => {
  if (pathname === "/dashboard") {
    return item.href === "/dashboard";
  }

  return [item.href, ...item.childPrefixes].some((prefix) => {
    if (prefix === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
};

export const getModuleByPath = (pathname: string) =>
  MODULE_NAV_ITEMS.find((item) => isModuleRouteActive(pathname, item));

// 子页面激活：财务概览/首页只精确匹配；收付管理含应收应付等子页面。
export const isTabRouteActive = (pathname: string | null, href: string) => {
  if (!pathname) return false;
  if (href === "/dashboard" || href === "/dashboard/finance")
    return pathname === href;
  if (href === "/dashboard/payments") {
    return [
      "/dashboard/payments",
      "/dashboard/finance/receivable",
      "/dashboard/finance/payable",
      "/dashboard/finance/bank-flow",
      "/dashboard/finance/invoices",
      "/dashboard/finance/reconciliation",
    ].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};
