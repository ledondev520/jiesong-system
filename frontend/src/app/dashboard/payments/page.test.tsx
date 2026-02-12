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

const mockApiGet = vi.fn();
const mockSearchParamGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
  },
}));

vi.mock('../../dashboard/finance/components/PaymentDialog', () => ({
  PaymentDialog: () => null,
}));

describe('PaymentsPage 交互逻辑', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockSearchParamGet.mockReset();
    mockSearchParamGet.mockImplementation((key: string) => (key === 'tab' ? 'payable' : null));
  });

  it('初始化会请求统计/应付/应收数据', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/finance/stats') {
        return Promise.resolve({
          data: {
            payable: { total: 1000, paid: 300, unpaid: 700 },
            receivable: { total: 2000, received: 500, unreceived: 1500 },
          },
        });
      }
      return Promise.resolve({ data: { items: [] } });
    });

    render(<PaymentsPage />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/finance/stats');
      expect(mockApiGet).toHaveBeenCalledWith('/finance/payables', { params: { pageSize: 100 } });
      expect(mockApiGet).toHaveBeenCalledWith('/finance/receivables', { params: { pageSize: 100 } });
    });
  });

  it('点击刷新会再次请求三类数据', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(screen.getByRole('button', { name: /刷新/ }));

    await waitFor(() => {
      const statsCalls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/finance/stats').length;
      expect(statsCalls).toBeGreaterThan(1);
    });
  });
});

