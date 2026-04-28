/**
 * Input: 收付款页面、finance API、URL参数、PaymentDialog
 * Output: 收付款页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentsPage from './page';

const mockSearchParamGet = vi.fn();
const mockGetStats = vi.fn();
const mockGetPayables = vi.fn();
const mockGetReceivables = vi.fn();
const mockGetUnallocatedPayments = vi.fn();
const mockAutoMatchUnallocatedPayments = vi.fn();
const mockGetFullReconciliation = vi.fn();
const mockGetTransactionStats = vi.fn();
const mockGetIncomingSummary = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => '/dashboard/payments',
}));

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
    getPayables: (...args: unknown[]) => mockGetPayables(...args),
    getReceivables: (...args: unknown[]) => mockGetReceivables(...args),
    getUnallocatedPayments: (...args: unknown[]) => mockGetUnallocatedPayments(...args),
    autoMatchUnallocatedPayments: (...args: unknown[]) => mockAutoMatchUnallocatedPayments(...args),
  },
}));

vi.mock('@/services/bankFlow.service', () => ({
  getFullReconciliation: (...args: unknown[]) => mockGetFullReconciliation(...args),
  getTransactionStats: (...args: unknown[]) => mockGetTransactionStats(...args),
  getIncomingSummary: (...args: unknown[]) => mockGetIncomingSummary(...args),
}));

vi.mock('../../dashboard/finance/components/PaymentDialog', () => ({
  PaymentDialog: () => null,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('PaymentsPage 交互逻辑', () => {
  beforeEach(() => {
    mockSearchParamGet.mockReset();
    mockSearchParamGet.mockImplementation((key: string) => (key === 'tab' ? 'payable' : null));
    mockGetStats.mockReset();
    mockGetPayables.mockReset();
    mockGetReceivables.mockReset();
    mockGetUnallocatedPayments.mockReset();
    mockAutoMatchUnallocatedPayments.mockReset();
    mockGetFullReconciliation.mockReset();
    mockGetTransactionStats.mockReset();
    mockGetIncomingSummary.mockReset();
    mockGetUnallocatedPayments.mockResolvedValue({ data: [] });
    mockGetFullReconciliation.mockResolvedValue({
      matched: [],
      unmatchedPayments: [],
      unmatchedInvoices: [],
      summary: {
        matchedCount: 0,
        normalCount: 0,
        underInvoicedCount: 0,
        underInvoicedGap: 0,
        overInvoicedCount: 0,
        overInvoicedGap: 0,
        unmatchedPaymentCount: 0,
        unmatchedPaymentTotal: 0,
        unmatchedInvoiceCount: 0,
        unmatchedInvoiceTotal: 0,
      },
    });
    mockGetTransactionStats.mockResolvedValue({ totalIn: 0, totalOut: 0, netFlow: 0, txnCount: 0 });
    mockGetIncomingSummary.mockResolvedValue({ items: [], total: 0 });
  });

  it('初始化会请求统计/应付/应收数据', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1000, paid: 300, unpaid: 700 },
        receivable: { total: 2000, received: 500, unreceived: 1500 },
      },
    });
    mockGetPayables.mockResolvedValue({ data: { items: [] } });
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });

    render(<PaymentsPage />);

    await waitFor(() => {
      expect(mockGetStats).toHaveBeenCalledTimes(1);
      expect(mockGetPayables).toHaveBeenCalledWith({ pageSize: 100 });
      expect(mockGetReceivables).toHaveBeenCalledWith({ pageSize: 100 });
      expect(mockGetUnallocatedPayments).toHaveBeenCalledTimes(1);
    });
  });

  it('点击刷新会再次请求三类数据', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1000, paid: 300, unpaid: 700 },
        receivable: { total: 2000, received: 500, unreceived: 1500 },
      },
    });
    mockGetPayables.mockResolvedValue({ data: { items: [] } });
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(screen.getByRole('button', { name: /刷新/ }));

    await waitFor(() => {
      expect(mockGetStats.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('应付列表为空时展示统一空态', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1000, paid: 1000, unpaid: 0 },
        receivable: { total: 2000, received: 500, unreceived: 1500 },
      },
    });
    mockGetPayables.mockResolvedValue({ data: { items: [] } });
    mockGetReceivables.mockResolvedValue({
      data: {
        items: [
          {
            id: 'rcv-1',
            contractNo: 'XS-1',
            totalAmount: 100,
            receivedAmount: 0,
            unreceiveAmount: 100,
            status: 'OPEN',
            items: [],
          },
        ],
      },
    });

    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('暂无付款数据').length).toBeGreaterThan(0);
    });
  });

  it('点击自动匹配会调用接口并刷新待分配与应收数据', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1000, paid: 300, unpaid: 700 },
        receivable: { total: 2000, received: 500, unreceived: 1500 },
      },
    });
    mockGetPayables.mockResolvedValue({ data: { items: [] } });
    mockGetReceivables.mockResolvedValue({
      data: {
        items: [
          {
            id: 'rcv-1',
            contractNo: 'EXP250024',
            totalAmount: 68006,
            receivedAmount: 0,
            unreceiveAmount: 68006,
            status: 'SHIPPED',
            stores: ['门店A'],
            items: [],
          },
        ],
      },
    });
    mockGetUnallocatedPayments.mockResolvedValue({
      data: [
        {
          id: 'receipt-1',
          type: 'RECEIVABLE_RECEIPT',
          amount: 68006,
          allocatedAmount: 30000,
          remainingAmount: 38006,
          customerName: 'Sp food trading LLC',
          currency: 'USD',
          paymentDate: '2026-03-10T00:00:00.000Z',
          note: 'EXP250024 回款',
          createdAt: '2026-03-10T00:00:00.000Z',
          updatedAt: '2026-03-10T00:00:00.000Z',
        },
      ],
    });
    mockAutoMatchUnallocatedPayments.mockResolvedValue({
      data: {
        inspectedCount: 1,
        matchedCount: 1,
        skippedCount: 0,
        matched: [],
        skipped: [],
      },
    });

    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(await screen.findByRole('button', { name: /自动匹配/ }));

    await waitFor(() => {
      expect(mockAutoMatchUnallocatedPayments).toHaveBeenCalledTimes(1);
      expect(mockGetUnallocatedPayments.mock.calls.length).toBeGreaterThan(1);
      expect(mockGetReceivables.mock.calls.length).toBeGreaterThan(1);
      expect(mockGetStats.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('待分配收款展示客户名称和剩余金额', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1000, paid: 300, unpaid: 700 },
        receivable: { total: 2000, received: 500, unreceived: 1500 },
      },
    });
    mockGetPayables.mockResolvedValue({ data: { items: [] } });
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });
    mockGetUnallocatedPayments.mockResolvedValue({
      data: [
        {
          id: 'receipt-2',
          type: 'RECEIVABLE_RECEIPT',
          amount: 33000,
          allocatedAmount: 30000,
          remainingAmount: 3000,
          customerName: 'Sp food trading LLC',
          currency: 'USD',
          paymentDate: '2026-03-20T00:00:00.000Z',
          note: '客户整笔回款',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      ],
    });

    render(<PaymentsPage />);

    expect(await screen.findByText('Sp food trading LLC')).toBeInTheDocument();
    expect(screen.getByText(/剩余待分配 USD 3,000/)).toBeInTheDocument();
  });

  it('应收列表展示捷淞归属与第三方来源方提示', async () => {
    mockGetStats.mockResolvedValue({
      data: {
        payable: { total: 1000, paid: 300, unpaid: 700 },
        receivable: { total: 2000, received: 500, unreceived: 1500 },
      },
    });
    mockGetPayables.mockResolvedValue({ data: { items: [] } });
    mockGetReceivables.mockResolvedValue({
      data: {
        items: [
          {
            id: 'rcv-owned-1',
            contractNo: 'EXP260002',
            totalAmount: 46000,
            receivedAmount: 33479.38,
            unreceiveAmount: 12520.62,
            status: 'SHIPPED',
            stores: ['圣荷西2115'],
            hasThirdPartyCargo: true,
            sourceParties: ['绿零'],
            items: [],
          },
        ],
      },
    });
    mockGetUnallocatedPayments.mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    render(<PaymentsPage />);
    await user.click(screen.getByRole('tab', { name: '应收账款' }));

    expect(await screen.findAllByText('含第三方拼柜')).not.toHaveLength(0);
    expect(screen.getByText('来源方')).toBeInTheDocument();
    expect(screen.getByText('绿零')).toBeInTheDocument();
  });
});
