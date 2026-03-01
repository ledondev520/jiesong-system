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
const mockApiGet = vi.fn();
const mockApiPut = vi.fn();
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
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    put: (...args: unknown[]) => mockApiPut(...args),
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

describe('SettingsPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockExportSystemData.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  it('加载后可点击基础档案快捷入口', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件', '箱'],
        brokers: ['捷淞'],
      },
    });

    const user = userEvent.setup();
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
      expect(screen.getByText('商品管理')).toBeInTheDocument();
    });

    await user.click(screen.getByText('商品管理'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/products');
  });

  it('在系统配置标签保存配置成功', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件', '箱'],
        brokers: ['捷淞'],
      },
    });
    mockApiPut.mockResolvedValue({});

    const user = userEvent.setup();
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '系统配置' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: '系统配置' }));
    await user.click(screen.getByRole('button', { name: /保存配置/ }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalled();
      expect(mockToastSuccess).toHaveBeenCalledWith('系统配置已保存');
    });
  });

  it('在数据导出标签可触发导出动作', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        exchangeRate: 7.2,
        profitRate: 1.3,
        units: ['件', '箱'],
        brokers: ['捷淞'],
      },
    });
    mockExportSystemData.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '数据导出' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: '数据导出' }));
    await user.click(screen.getByRole('button', { name: '导出供应商' }));

    await waitFor(() => {
      expect(mockExportSystemData).toHaveBeenCalledWith('suppliers', '供应商.csv');
      expect(mockToastSuccess).toHaveBeenCalledWith('供应商数据导出成功');
    });
  });
});
