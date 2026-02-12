/**
 * Input: 采购管理页面、purchaseService、router、toast
 * Output: 采购管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PurchasePage from './page';

const mockPush = vi.fn();
const mockGetAll = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('PurchasePage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetAll.mockReset();
    mockToastError.mockReset();
  });

  it('加载后展示空态文案', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<PurchasePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '采购管理' })).toBeInTheDocument();
      expect(screen.getByText('暂无合同。')).toBeInTheDocument();
    });
  });

  it('点击新增采购合同按钮会跳转创建页', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<PurchasePage />);

    await user.click(screen.getByRole('button', { name: /新增采购合同/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/create');
  });

  it('点击查看按钮会跳转详情页', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'pc-1',
            contractNo: 'CG2500001',
            status: 'DRAFT',
            totalAmount: 1000,
            paidAmount: 0,
            signedAt: null,
            supplier: { name: '供应商A', hasQualityIssue: false },
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<PurchasePage />);

    const viewButton = await screen.findByRole('button', { name: /查看合同 CG2500001/ });
    await user.click(viewButton);

    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/pc-1');
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<PurchasePage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载采购合同失败');
    });
  });
});

