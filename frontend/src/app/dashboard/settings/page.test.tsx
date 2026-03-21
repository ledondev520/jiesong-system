/**
 * Input: 设置页面、api、router、toast
 * Output: 设置页关键交互测试结果
 * Pos: 前端系统设置交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './page';

const mockPush = vi.fn();
const mockGetSystemConfig = vi.fn();
const mockUpdateSystemConfig = vi.fn();
const mockExportSystemData = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/settings',
}));

vi.mock('@/services/config.service', () => ({
  configService: {
    getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
    updateSystemConfig: (...args: unknown[]) => mockUpdateSystemConfig(...args),
  },
}));

vi.mock('@/services/system.service', () => ({
  exportSystemData: (...args: unknown[]) => mockExportSystemData(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/components/tools/ClaudeCostCalculator', () => ({
  ClaudeCostCalculator: () => <div>Claude成本计算器</div>,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('SettingsPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetSystemConfig.mockReset();
    mockUpdateSystemConfig.mockReset();
    mockExportSystemData.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it('加载后展示系统配置标题', async () => {
    mockGetSystemConfig.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件', '箱'],
        brokers: ['捷淞'],
      },
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '系统配置' })).toBeInTheDocument();
    });
  });

  it('加载系统配置后可保存配置', async () => {
    mockGetSystemConfig.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件', '箱'],
        brokers: ['捷淞'],
      },
    });
    mockUpdateSystemConfig.mockResolvedValue({});

    const user = userEvent.setup();
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存配置/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /保存配置/ }));

    await waitFor(() => {
      expect(mockUpdateSystemConfig).toHaveBeenCalled();
      expect(mockToastSuccess).toHaveBeenCalledWith('系统配置已保存');
    });
  });

  it('配置加载失败时展示错误提示', async () => {
    mockGetSystemConfig.mockRejectedValue(new Error('load failed'));

    render(<SettingsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载系统配置失败');
    });
  });
});
