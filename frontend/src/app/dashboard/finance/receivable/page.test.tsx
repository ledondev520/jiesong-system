/**
 * Input: 应收账款页面、finance API、PaymentDialog、toast
 * Output: 应收账款页交互逻辑测试结果
 * Pos: 前端财务子页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceivablePage from './page';

const mockToastError = vi.fn();
const mockGetReceivables = vi.fn();
const mockExportReportPdf = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/finance/receivable',
}));

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getReceivables: (...args: unknown[]) => mockGetReceivables(...args),
    exportReportPdf: (...args: unknown[]) => mockExportReportPdf(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('../components/PaymentDialog', () => ({
  PaymentDialog: () => <div>收款弹窗</div>,
}));

describe('ReceivablePage 交互逻辑', () => {
  beforeEach(() => {
    mockGetReceivables.mockReset();
    mockToastError.mockReset();
    mockExportReportPdf.mockReset();
  });

  it('无数据时展示空态', async () => {
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });
    render(<ReceivablePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '应收账款' })).toBeInTheDocument();
      expect(screen.getByText('暂无待收账款')).toBeInTheDocument();
    });
  });

  it('点击刷新会再次请求数据', async () => {
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ReceivablePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => {
      expect(mockGetReceivables).toHaveBeenCalledTimes(2);
    });
  });

  it('点击导出 PDF 会调用报表导出', async () => {
    mockGetReceivables.mockResolvedValue({ data: { items: [] } });
    mockExportReportPdf.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReceivablePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /导出 PDF/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /导出 PDF/ }));

    expect(mockExportReportPdf).toHaveBeenCalledWith('sales', '应收账款报表.pdf');
  });
});
