/**
 * Input: 财务概览页面、finance stats、汇率、银行流水和发票统计 Interface
 * Output: 财务概览页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import FinancePage from './page';

const mockGetStats = vi.fn();
const mockApiGet = vi.fn();
const mockGetTransactionStats = vi.fn();
const mockGetInvoiceStats = vi.fn();

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
  },
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

vi.mock('@/services/bankFlow.service', () => ({
  getTransactionStats: (...args: unknown[]) => mockGetTransactionStats(...args),
  getInvoiceStats: (...args: unknown[]) => mockGetInvoiceStats(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/finance',
}));

vi.mock('@/lib/tab-memory', () => ({
  saveModuleTab: vi.fn(),
  getModuleTab: vi.fn((href: string) => href),
}));

describe('FinancePage 交互逻辑', () => {
  beforeEach(() => {
    mockGetStats.mockReset();
    mockApiGet.mockReset();
    mockGetTransactionStats.mockReset();
    mockGetInvoiceStats.mockReset();
    mockGetTransactionStats.mockResolvedValue({ totalIn: 0, totalOut: 0, netFlow: 0, txnCount: 0 });
    mockGetInvoiceStats.mockResolvedValue({
      validTotal: 0,
      validTax: 0,
      validAmount: 0,
      validCount: 0,
      reversedCount: 0,
      totalCount: 0,
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/system/exchange-rate')) {
        return Promise.resolve({
          data: { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 },
        });
      }
      if (url.includes('/finance/payment-trends')) {
        return Promise.resolve({
          data: [
            { label: '上期', receivables: 800, payables: 300 },
            { label: '本期', receivables: 1000, payables: 400 },
          ],
        });
      }
      if (url.includes('/finance/overdue-receivables')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: null });
    });
  });

  it('图表库通过延迟加载的内部 Module 隔离', () => {
    const pageSource = readFileSync('src/app/dashboard/finance/page.tsx', 'utf8');

    expect(pageSource).not.toContain("from 'recharts'");
    expect(pageSource).toContain("import('./components/FinanceOverviewCharts')");
  });

  it('加载完成后展示统计信息', async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 1000, unreceived: 2200 },
    });

    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '财务概览' })).toBeInTheDocument();
      expect(screen.getByText('先看收付压力，再下钻经营执行')).toBeInTheDocument();
      expect(screen.getByText('应付账款总额')).toBeInTheDocument();
      expect(screen.getByText('待收账款')).toBeInTheDocument();
      expect(screen.getByText(/当前客户剩余欠款/)).toBeInTheDocument();
      expect(screen.getByText('财务报表分析')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /查看报表分析/ })).toHaveAttribute('href', '/dashboard/finance/statements');
      expect(screen.queryByTestId('financial-statements-section')).not.toBeInTheDocument();
      expect(screen.getByTestId('finance-overview-charts')).toBeInTheDocument();
      expect(screen.getByText('收支对比')).toBeInTheDocument();
      expect(screen.getByText('现金流预测')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('初始加载中会显示加载文案', () => {
    mockGetStats.mockReturnValue(new Promise(() => {}));
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<FinancePage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
