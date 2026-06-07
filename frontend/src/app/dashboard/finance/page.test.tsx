/**
 * Input: 财务驾驶舱页面、finance stats API、system exchange-rate API
 * Output: 财务驾驶舱页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FinancePage from './page';

const mockGetStats = vi.fn();
const mockApiGet = vi.fn();
const mockGetTransactionStats = vi.fn();
const mockGetInvoiceStats = vi.fn();
const mockGetAnalytics = vi.fn();
const mockListStatements = vi.fn();
const mockGetStatementDetail = vi.fn();
const mockImportFromFolder = vi.fn();
const mockImportFile = vi.fn();

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

vi.mock('@/services/financialStatements.service', () => ({
  financialStatementsService: {
    getAnalytics: (...args: unknown[]) => mockGetAnalytics(...args),
    listStatements: (...args: unknown[]) => mockListStatements(...args),
    getStatementDetail: (...args: unknown[]) => mockGetStatementDetail(...args),
    importFromFolder: (...args: unknown[]) => mockImportFromFolder(...args),
    importFile: (...args: unknown[]) => mockImportFile(...args),
  },
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
    mockGetAnalytics.mockReset();
    mockListStatements.mockReset();
    mockGetStatementDetail.mockReset();
    mockImportFromFolder.mockReset();
    mockImportFile.mockReset();
    // 默认 exchange-rate 返回
    mockApiGet.mockResolvedValue({
      data: { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 },
    });
    mockGetTransactionStats.mockResolvedValue({ totalIn: 0, totalOut: 0, netFlow: 0, txnCount: 0 });
    mockGetInvoiceStats.mockResolvedValue({
      validTotal: 0,
      validTax: 0,
      validAmount: 0,
      validCount: 0,
      reversedCount: 0,
      totalCount: 0,
    });
    const balanceSheet = {
      id: 'bs-1',
      periodId: 'period-1',
      cashAndEquivalents: 80000,
      shortTermInvestments: 0,
      accountsReceivable: 120000,
      prepaidExpenses: 10000,
      otherReceivables: 5000,
      inventory: 45000,
      totalCurrentAssets: 260000,
      totalNonCurrentAssets: 240000,
      totalAssets: 500000,
      accountsPayable: 90000,
      advancedReceipts: 0,
      staffWagesPayable: 12000,
      taxesPayable: 8000,
      otherPayables: 5000,
      totalCurrentLiabilities: 115000,
      totalNonCurrentLiabilities: 85000,
      totalLiabilities: 200000,
      paidInCapital: 200000,
      capitalReserve: 20000,
      surplusReserve: 10000,
      retainedEarnings: 70000,
      totalEquity: 300000,
    };
    const incomeStatement = {
      id: 'is-1',
      periodId: 'period-1',
      revenueMonth: 100000,
      costOfSalesMonth: 40000,
      taxesMonth: 3000,
      sellingExpensesMonth: 5000,
      adminExpensesMonth: 10000,
      financialExpensesMonth: 3000,
      investmentIncomeMonth: 0,
      operatingProfitMonth: 42000,
      nonOperatingIncomeMonth: 0,
      nonOperatingExpensesMonth: 0,
      totalProfitMonth: 42000,
      incomeTaxMonth: 7000,
      netProfitMonth: 35000,
      revenueYTD: 100000,
      costOfSalesYTD: 40000,
      taxesYTD: 3000,
      sellingExpensesYTD: 5000,
      adminExpensesYTD: 10000,
      financialExpensesYTD: 3000,
      investmentIncomeYTD: 0,
      operatingProfitYTD: 42000,
      nonOperatingIncomeYTD: 0,
      nonOperatingExpensesYTD: 0,
      totalProfitYTD: 42000,
      incomeTaxYTD: 7000,
      netProfitYTD: 35000,
    };
    const period = {
      id: 'period-1',
      year: 2025,
      month: 1,
      periodLabel: '2025年1月',
      reportDate: '2025-01-31',
      importedAt: '2025-02-01',
      balanceSheet,
      incomeStatement,
    };
    mockGetAnalytics.mockResolvedValue({
      trends: [
        {
          label: '2025-01',
          year: 2025,
          month: 1,
          revenue: 100000,
          costOfSales: 40000,
          adminExpenses: 10000,
          financialExpenses: 3000,
          sellingExpenses: 5000,
          operatingProfit: 42000,
          netProfit: 35000,
          totalAssets: 500000,
          totalLiabilities: 200000,
          totalEquity: 300000,
          cash: 80000,
          debtRatio: 0.4,
        },
      ],
      alerts: [],
      historicalAlerts: [],
      latestPeriod: {
        periodLabel: '2025年1月',
        balanceSheet,
        incomeStatement,
      },
      totalPeriods: 1,
    });
    mockListStatements.mockResolvedValue([period]);
    mockGetStatementDetail.mockResolvedValue(period);
  });

  it('加载完成后展示统计信息', async () => {
    mockGetStats.mockResolvedValue({
      payable: { total: 1200, paid: 400, unpaid: 800 },
      receivable: { total: 3200, received: 1000, unreceived: 2200 },
    });

    render(<FinancePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '财务总览' })).toBeInTheDocument();
      expect(screen.getByText('先看收付压力，再下钻经营报表')).toBeInTheDocument();
      expect(screen.getByText('应付账款总额')).toBeInTheDocument();
      expect(screen.getByText('待收账款')).toBeInTheDocument();
      expect(screen.getByText(/当前客户剩余欠款/)).toBeInTheDocument();
      expect(screen.getByText('经营进度与报表分析')).toBeInTheDocument();
      expect(screen.getAllByText('收入与利润趋势').length).toBeGreaterThan(0);
      expect(screen.getAllByText('成本结构').length).toBeGreaterThan(0);
      expect(screen.getAllByText('资产负债').length).toBeGreaterThan(0);
      expect(screen.getAllByText('账期详情').length).toBeGreaterThan(0);
    });
  });

  it('初始加载中会显示加载文案', () => {
    mockGetStats.mockReturnValue(new Promise(() => {}));
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<FinancePage />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
