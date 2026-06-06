/**
 * Input: 销售合同页面、salesService、router、toast
 * Output: 销售合同页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesPage from './page';

const mockPush = vi.fn();
const mockGetAll = vi.fn();
const mockDelete = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  usePathname: () => '/dashboard/sales',
  useSearchParams: () => ({
    get: vi.fn(() => null),
    toString: vi.fn(() => ''),
  }),
}));

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('SalesPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('加载后展示销售模块概览与空态文案', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<SalesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '销售合同' })).toBeInTheDocument();
      expect(screen.getByText('待装柜')).toBeInTheDocument();
      expect(screen.getByText('在途')).toBeInTheDocument();
      expect(screen.getByText('暂无销售合同')).toBeInTheDocument();
    });
  });

  it('点击新增销售合同按钮会跳转创建页', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SalesPage />);

    await user.click(screen.getByRole('button', { name: /新增销售合同/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<SalesPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载销售合同失败');
    });
  });

  it('删除成功后提示并刷新列表', async () => {
    const contract = {
      id: 'sc-1',
      contractNo: 'EXP2500001',
      status: 'DRAFT',
      signedAt: null,
      totalBoxes: 1,
      volume: 1.2,
      grossWeight: 100,
      totalAmount: 1000,
      hasThirdPartyCargo: true,
      sourceParties: ['阿珍贵州'],
      port: { name: '深圳' },
      stores: ['禧瑞都'],
    };
    mockGetAll.mockResolvedValue({ data: { items: [contract] } });
    mockDelete.mockResolvedValue({ code: 200 });
    const user = userEvent.setup();
    render(<SalesPage />);

    const deleteButton = await screen.findByRole('button', { name: /删除合同 EXP2500001/ });
    await user.click(deleteButton);
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('sc-1');
      expect(mockToastSuccess).toHaveBeenCalledWith('合同 EXP2500001 已删除');
      expect(screen.getAllByText('含第三方拼柜').length).toBeGreaterThan(0);
      expect(screen.getByText('来源方：阿珍贵州')).toBeInTheDocument();
    });
  });

  it('删除失败时提示错误', async () => {
    const contract = {
      id: 'sc-2',
      contractNo: 'EXP2500002',
      status: 'DRAFT',
      signedAt: null,
      totalBoxes: 1,
      volume: 1.2,
      grossWeight: 100,
      totalAmount: 1000,
      port: { name: '宁波' },
    };
    mockGetAll.mockResolvedValue({ data: { items: [contract] } });
    mockDelete.mockRejectedValue(new Error('delete failed'));
    const user = userEvent.setup();
    render(<SalesPage />);

    const deleteButton = await screen.findByRole('button', { name: /删除合同 EXP2500002/ });
    await user.click(deleteButton);
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('删除合同失败');
    });
  });
});
