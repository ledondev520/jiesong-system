import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@/types';
import {
  getDefaultDashboardHref,
  getPrimaryMobileModuleNavItems,
  getSecondaryMobileModuleNavItems,
  getModuleTargetHref,
  getVisibleModuleNavItems,
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

    const visibleForAdmin = getVisibleModuleNavItems(Role.ADMIN);
    expect(visibleForAdmin.some((item) => item.key === 'admin')).toBe(true);
  });

  it('移动端主 Tab 和更多入口按配置分组', () => {
    const primaryItems = getPrimaryMobileModuleNavItems(Role.ADMIN).map((item) => item.key);
    const secondaryItems = getSecondaryMobileModuleNavItems(Role.ADMIN).map((item) => item.key);

    expect(primaryItems).toEqual(['operations', 'procurement', 'export', 'finance']);
    expect(secondaryItems).toEqual(['admin']);
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
  });
});
