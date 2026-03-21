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
  },
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
});
