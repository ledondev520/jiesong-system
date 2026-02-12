/**
 * Input: 出口合同页面、salesService、router、toast
 * Output: 出口合同页交互逻辑测试结果
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

describe('SalesPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('加载后展示空态文案', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<SalesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '出口合同' })).toBeInTheDocument();
      expect(screen.getByText('暂无出口合同。')).toBeInTheDocument();
    });
  });

  it('点击新增出口合同按钮会跳转创建页', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<SalesPage />);

    await user.click(screen.getByRole('button', { name: /新增出口合同/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<SalesPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载出口合同失败');
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
      port: { name: '深圳' },
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

