import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@/types';
import {
  getDefaultDashboardHref,
  getPrimaryMobileModuleNavItems,
  getSecondaryMobileModuleNavItems,
  getModuleTargetHref,
  getVisibleModuleNavItems,
  getModuleByPath,
  isTabRouteActive,
  MODULE_NAV_ITEMS,
} from './navigation.config';

describe('navigation.config helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('按角色返回可见模块', () => {
    const visibleForSales = getVisibleModuleNavItems(Role.SALES);
    expect(visibleForSales.some((item) => item.key === 'admin')).toBe(false);
    expect(visibleForSales.some((item) => item.key === 'ai')).toBe(true);

    const visibleForAdmin = getVisibleModuleNavItems(Role.ADMIN);
    expect(visibleForAdmin.some((item) => item.key === 'admin')).toBe(true);
    expect(visibleForAdmin.some((item) => item.key === 'ai')).toBe(true);
  });

  it('采购员可从采购模块维护同一商品档案，管理模块仍仅管理员可见', () => {
    expect(getModuleByPath('/dashboard/products')?.key).toBe('procurement');
    expect(getVisibleModuleNavItems(Role.PURCHASE).some(item => item.key === 'admin')).toBe(false);
  });

  it('移动端主 Tab 和更多入口按配置分组', () => {
    const primaryItems = getPrimaryMobileModuleNavItems(Role.ADMIN).map((item) => item.key);
    const secondaryItems = getSecondaryMobileModuleNavItems(Role.ADMIN).map((item) => item.key);

    expect(primaryItems).toEqual(['operations', 'procurement', 'export', 'finance']);
    expect(secondaryItems).toEqual(['ai', 'admin']);
  });

  it('一级导航不展示项目驾驶舱模块', () => {
    const visibleForAdmin = getVisibleModuleNavItems(Role.ADMIN).map((item) => item.key);

    expect(visibleForAdmin).not.toContain('dev');
  });

  it('生产前端不再携带会追踪整个仓库的项目驾驶舱路由', () => {
    expect(existsSync('src/app/dashboard/dev/page.tsx')).toBe(false);
    expect(existsSync('src/app/api/dev/status/route.ts')).toBe(false);
    expect(existsSync('src/lib/dev-cockpit.ts')).toBe(false);
  });

  it('采购模块 Tab 不再把合同模板作为独立页面', () => {
    const procurement = MODULE_NAV_ITEMS.find((item) => item.key === 'procurement');

    expect(procurement?.tabs.map((tab) => tab.label)).toEqual(['采购合同', '供应商管理', '库存状态', '商品档案']);
    expect(procurement?.childPrefixes).not.toContain('/dashboard/contract-templates');
  });

  it('出口模块只保留出口合同、出口退税和 HS 编码', () => {
    const exportModule = MODULE_NAV_ITEMS.find((item) => item.key === 'export');

    expect(exportModule?.label).toBe('出口');
    expect(exportModule?.tabs.map((tab) => tab.label)).toEqual(['出口合同', '出口退税', 'HS 编码']);
    expect(exportModule?.childPrefixes).toContain('/dashboard/customs-declarations');
    expect(exportModule?.childPrefixes).toContain('/dashboard/hs-codes');
  });

  it('顶层导航不再展示仓储物流模块', () => {
    expect(MODULE_NAV_ITEMS.map((item) => item.key)).not.toContain('logistics');
    expect(MODULE_NAV_ITEMS.map((item) => item.label)).not.toContain('仓储物流');
  });

  it('财务模块只保留两个顶层工作入口', () => {
    const finance = MODULE_NAV_ITEMS.find((item) => item.key === 'finance');

    expect(finance?.tabs.map((tab) => tab.label)).toEqual(['财务概览', '财务报表', '收付管理']);
  });

  it('系统管理只保留常规管理入口', () => {
    const admin = MODULE_NAV_ITEMS.find((item) => item.key === 'admin');

    expect(admin?.tabs.map((tab) => tab.label)).toEqual(['系统配置', '账号管理', '系统日志']);
  });

  it('AI 助手作为独立模块，不挂在系统管理 Tab 下', () => {
    const ai = MODULE_NAV_ITEMS.find((item) => item.key === 'ai');
    const admin = MODULE_NAV_ITEMS.find((item) => item.key === 'admin');

    expect(ai?.label).toBe('AI 助手');
    expect(ai?.defaultHref).toBe('/dashboard/ai');
    expect(ai?.tabs.map((tab) => tab.label)).toEqual(['开始对话', '会话记录']);
    expect(admin?.tabs.map((tab) => tab.label)).not.toContain('AI 会话');
    expect(admin?.childPrefixes).not.toContain('/dashboard/ai');
  });

  it('返回当前角色的默认 dashboard 落点', () => {
    expect(getDefaultDashboardHref(Role.SALES)).toBe('/dashboard');
  });

  it('模块目标路径在记忆无效时回退到 defaultHref', () => {
    const adminItem = MODULE_NAV_ITEMS.find((item) => item.key === 'admin');
    vi.mocked(localStorage.getItem).mockReturnValue('/dashboard/contracts');

    expect(getModuleTargetHref(adminItem!)).toBe('/dashboard/settings');
  });

  it('finance tab 激活与 statements 不串扰', () => {
    expect(isTabRouteActive('/dashboard/finance', '/dashboard/finance')).toBe(true);
    expect(isTabRouteActive('/dashboard/finance/statements', '/dashboard/finance')).toBe(false);
    expect(isTabRouteActive('/dashboard/finance/statements', '/dashboard/finance/statements')).toBe(true);
    expect(isTabRouteActive('/dashboard/finance/statements', '/dashboard/payments')).toBe(false);
    expect(isTabRouteActive('/dashboard/finance/receivable', '/dashboard/payments')).toBe(true);
    expect(isTabRouteActive('/dashboard/finance/payable', '/dashboard/payments')).toBe(true);
    expect(isTabRouteActive('/dashboard/finance/bank-flow', '/dashboard/payments')).toBe(true);
    expect(isTabRouteActive('/dashboard/finance/invoices', '/dashboard/payments')).toBe(true);
    expect(isTabRouteActive('/dashboard/finance/reconciliation', '/dashboard/payments')).toBe(true);
  });

  it('旧仓储物流路径归入采购库存状态，报关单归入出口退税', () => {
    expect(isTabRouteActive('/dashboard/logistics', '/dashboard/inventory-status')).toBe(true);
    expect(isTabRouteActive('/dashboard/customs-declarations', '/dashboard/tax-refunds')).toBe(true);
    expect(isTabRouteActive('/dashboard/customs-declarations/create', '/dashboard/tax-refunds')).toBe(true);
  });
});
