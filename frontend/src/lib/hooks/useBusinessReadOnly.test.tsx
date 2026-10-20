import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Role } from '@/types';
import { BusinessWrite, isBossRestrictedPath } from './useBusinessReadOnly';
import { getVisibleModuleNavItems } from '@/components/layout/navigation.config';

const auth = vi.hoisted(() => ({ role: 'BOSS' }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: auth.role } }) }));
afterEach(cleanup);

it('老板保留阅读与筛选，隐藏业务写操作；原操作角色保留写操作', () => {
  const content = () => <><button>筛选</button><BusinessWrite><button>保存合同</button></BusinessWrite></>;
  auth.role = Role.BOSS;
  const view = render(content());
  expect(screen.getByRole('button', { name: '筛选' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '保存合同' })).not.toBeInTheDocument();
  auth.role = Role.PURCHASE;
  view.rerender(content());
  expect(screen.getByRole('button', { name: '保存合同' })).toBeInTheDocument();
});

it('老板导航覆盖四个业务方向和自身通知，排除AI与系统管理', () => {
  expect(getVisibleModuleNavItems(Role.BOSS).map((item) => item.key)).toEqual(['operations', 'procurement', 'export', 'finance', 'notifications']);
  for (const path of ['/dashboard/purchase/create', '/dashboard/sales/id/edit', '/dashboard/ai', '/dashboard/settings', '/dashboard/users']) expect(isBossRestrictedPath(path)).toBe(true);
  for (const path of ['/dashboard/purchase/id', '/dashboard/finance', '/dashboard/system/notifications', '/dashboard/profile']) expect(isBossRestrictedPath(path)).toBe(false);
});
