/**
 * Input: 系统管理旧路由页面、router
 * Output: 旧路由跳转测试
 * Pos: 运维模块
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemManagementPage from './page';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    replace: mockReplace,
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('SystemManagementPage', () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it('渲染运维中心总览页，包含三大功能入口', () => {
    render(<SystemManagementPage />);
    expect(screen.getAllByText('通知中心').length).toBeGreaterThan(0);
    expect(screen.getAllByText('系统日志').length).toBeGreaterThan(0);
    expect(screen.getAllByText('导入记录').length).toBeGreaterThan(0);
  });
});
