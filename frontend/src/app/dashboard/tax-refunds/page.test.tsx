/**
 * Input: 退税列表页、taxRefundService、router、toast
 * Output: 退税列表页交互测试结果
 * Pos: 前端业务页交互测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaxRefundsDashboardPage from './page';

const mockPush = vi.fn();
const mockGetAll = vi.fn();
const mockGenerateDrafts = vi.fn();
const mockSearchParamGet = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
}));

vi.mock('@/services/taxRefund.service', () => ({
  taxRefundService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    generateDrafts: (...args: unknown[]) => mockGenerateDrafts(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe('TaxRefundsDashboardPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetAll.mockReset();
    mockGenerateDrafts.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockSearchParamGet.mockReset();
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === 'keyword') return '';
      if (key === 'status') return 'ALL';
      return null;
    });
  });

  it('根据 URL 查询参数初始化筛选并加载退税记录', async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === 'keyword') return 'TR-2026';
      if (key === 'status') return 'APPLIED';
      return null;
    });
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'tr-1',
            refundNo: 'TR-2026-001',
            status: 'APPLIED',
            salesContractId: 'sc-1',
            customsDeclarationId: 'cd-1',
            forexVerificationId: 'fv-1',
            declaredAmount: 128000,
            refundableAmount: 116500,
            refundedAmount: 0,
            appliedAt: '2026-03-07',
            refundedAt: null,
            note: '等待税局反馈',
            createdAt: '2026-03-07T00:00:00.000Z',
            updatedAt: '2026-03-07T00:00:00.000Z',
          },
        ],
      },
    });

    render(<TaxRefundsDashboardPage />);

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        keyword: 'TR-2026',
        status: 'APPLIED',
      });
    });

    expect(screen.getByDisplayValue('TR-2026')).toBeInTheDocument();
    expect(screen.getByText('TR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('等待税局反馈')).toBeInTheDocument();
  });

  it('点击新增按钮跳转创建页，点击详情跳转详情页', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'tr-2',
            refundNo: 'TR-2026-002',
            status: 'REFUNDED',
            salesContractId: 'sc-2',
            customsDeclarationId: 'cd-2',
            forexVerificationId: null,
            declaredAmount: 86000,
            refundableAmount: 80000,
            refundedAmount: 79000,
            appliedAt: '2026-03-05',
            refundedAt: '2026-03-18',
            note: '',
            createdAt: '2026-03-05T00:00:00.000Z',
            updatedAt: '2026-03-18T00:00:00.000Z',
          },
        ],
      },
    });
    const user = userEvent.setup();

    render(<TaxRefundsDashboardPage />);

    await user.click(screen.getByRole('button', { name: '新建退税单' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tax-refunds/create');

    await user.click(await screen.findByRole('button', { name: /查看详情 TR-2026-002/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tax-refunds/tr-2');
  });

  it('点击自动生成草稿后提示结果并刷新列表', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [],
      },
    });
    mockGenerateDrafts.mockResolvedValue({
      data: {
        created: 2,
        skipped: 1,
      },
    });
    const user = userEvent.setup();

    render(<TaxRefundsDashboardPage />);

    await user.click(screen.getByRole('button', { name: '自动生成草稿' }));

    await waitFor(() => {
      expect(mockGenerateDrafts).toHaveBeenCalledWith({});
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('自动生成完成：新增 2 条，跳过 1 条');
    expect(mockGetAll).toHaveBeenCalledTimes(2);
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));

    render(<TaxRefundsDashboardPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载退税记录失败');
    });
  });
});
