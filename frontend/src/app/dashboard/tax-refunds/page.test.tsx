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
const mockReplace = vi.fn();
const mockGetAll = vi.fn();
const mockGenerateDrafts = vi.fn();
const mockGetWorkbench = vi.fn();
const mockSearchParamGet = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => '/dashboard/tax-refunds',
}));

vi.mock('@/services/taxRefund.service', () => ({
  taxRefundService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    generateDrafts: (...args: unknown[]) => mockGenerateDrafts(...args),
    getWorkbench: (...args: unknown[]) => mockGetWorkbench(...args),
    exportDeclarationCsv: vi.fn(),
    getInvoiceVerification: vi.fn(),
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

describe('TaxRefundsDashboardPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockGetAll.mockReset();
    mockGenerateDrafts.mockReset();
    mockGetWorkbench.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockSearchParamGet.mockReset();
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === 'keyword') return '';
      if (key === 'status') return 'ALL';
      return null;
    });
    mockGetWorkbench.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 100,
        summary: {
          contracts: 0,
          readyToExport: 0,
          needsReview: 0,
          missingInvoices: 0,
          draftCount: 0,
          submittedCount: 0,
          estimatedRefundableAmount: 0,
          latestInvoiceBatch: null,
        },
        disclaimer: '仅用于内部准备',
      },
    });
  });

  it('根据 URL 查询参数初始化筛选并加载退税记录', async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === 'keyword') return 'TR-2026';
      if (key === 'status') return 'APPLIED';
      if (key === 'view') return 'refunds';
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
    expect(screen.getByRole('tab', { name: '报关单' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '退税工作台' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '退税记录' })).toBeInTheDocument();
    expect((await screen.findAllByText('TR-2026-001')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('等待税局反馈')).length).toBeGreaterThan(0);
  });

  it('新建退税单按钮已移除，详情跳转仍正常', async () => {
    mockSearchParamGet.mockImplementation((key: string) => key === 'view' ? 'refunds' : key === 'status' ? 'ALL' : '');
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

    // 新建退税单按钮已移除，退税单通过出口合同流程创建
    expect(screen.queryByRole('button', { name: '新建退税单' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /查看详情 TR-2026-002/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tax-refunds/tr-2');
  });

  it('点击自动生成草稿后提示结果并刷新列表', async () => {
    mockSearchParamGet.mockImplementation((key: string) => key === 'view' ? 'refunds' : key === 'status' ? 'ALL' : '');
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

    await user.click(screen.getByRole('button', { name: '批量生成草稿' }));

    await waitFor(() => {
      expect(mockGenerateDrafts).toHaveBeenCalledWith({});
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('自动生成完成：新增 2 条，跳过 1 条');
    expect(mockGetAll).toHaveBeenCalledTimes(2);
  });

  it('加载失败时提示错误', async () => {
    mockSearchParamGet.mockImplementation((key: string) => key === 'view' ? 'refunds' : key === 'status' ? 'ALL' : '');
    mockGetAll.mockRejectedValue(new Error('load failed'));

    render(<TaxRefundsDashboardPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载退税记录失败');
    });
  });

  it('默认进入退税工作台并展示三段式操作入口', async () => {
    render(<TaxRefundsDashboardPage />);
    expect(await screen.findByRole('heading', { name: '出口退税工作台' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入进项发票' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成退税草稿' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成申报明细' })).toBeDisabled();
    await waitFor(() => expect(mockGetWorkbench).toHaveBeenCalledWith({ page: 1, pageSize: 100, keyword: undefined, stage: 'ALL' }));
  });
});
