/**
 * Input: 财务报表分析页面、财务报表服务、缓存层、导入交互
 * Output: 财务报表页结构拆分前后的关键行为回归结果
 * Pos: 前端财务报表页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import FinancialStatementsPage from './page';

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockGetAnalytics = vi.fn();
const mockListStatements = vi.fn();
const mockGetStatementDetail = vi.fn();
const mockImportFromFolder = vi.fn();
const mockImportFile = vi.fn();
const mockCachedFetch = vi.fn();
const mockInvalidateCache = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastWarning = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  usePathname: () => '/dashboard/finance/statements',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/tab-memory', () => ({
  saveModuleTab: vi.fn(),
  getModuleTab: vi.fn((href: string) => href),
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

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: (...args: unknown[]) => mockCachedFetch(...args),
  invalidateCache: (...args: unknown[]) => mockInvalidateCache(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <select
      aria-label="选择账期"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: ReactNode;
  }) => <option value={value}>{children}</option>,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div>Line</div>,
  Area: () => <div>Area</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>CartesianGrid</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
  ReferenceLine: () => <div>ReferenceLine</div>,
}));

const januaryDetail = {
  id: 'period-2025-1',
  year: 2025,
  month: 1,
  periodLabel: '2025年1账期',
  reportDate: '2025-01-31',
  importedAt: '2025-02-01T00:00:00.000Z',
  balanceSheet: {
    id: 'bs-1',
    periodId: 'period-2025-1',
    cashAndEquivalents: 120000,
    shortTermInvestments: 0,
    accountsReceivable: 90000,
    prepaidExpenses: 10000,
    otherReceivables: 5000,
    inventory: 45000,
    totalCurrentAssets: 270000,
    totalNonCurrentAssets: 80000,
    totalAssets: 350000,
    accountsPayable: 30000,
    advancedReceipts: 12000,
    staffWagesPayable: 6000,
    taxesPayable: 4000,
    otherPayables: 5000,
    totalCurrentLiabilities: 57000,
    totalNonCurrentLiabilities: 8000,
    totalLiabilities: 65000,
    paidInCapital: 200000,
    capitalReserve: 10000,
    surplusReserve: 8000,
    retainedEarnings: 67000,
    totalEquity: 285000,
  },
  incomeStatement: {
    id: 'is-1',
    periodId: 'period-2025-1',
    revenueMonth: 160000,
    costOfSalesMonth: 90000,
    taxesMonth: 4000,
    sellingExpensesMonth: 7000,
    adminExpensesMonth: 6000,
    financialExpensesMonth: 3000,
    investmentIncomeMonth: 0,
    operatingProfitMonth: 50000,
    nonOperatingIncomeMonth: 0,
    nonOperatingExpensesMonth: 0,
    totalProfitMonth: 50000,
    incomeTaxMonth: 12000,
    netProfitMonth: 38000,
    revenueYTD: 160000,
    costOfSalesYTD: 90000,
    taxesYTD: 4000,
    sellingExpensesYTD: 7000,
    adminExpensesYTD: 6000,
    financialExpensesYTD: 3000,
    investmentIncomeYTD: 0,
    operatingProfitYTD: 50000,
    nonOperatingIncomeYTD: 0,
    nonOperatingExpensesYTD: 0,
    totalProfitYTD: 50000,
    incomeTaxYTD: 12000,
    netProfitYTD: 38000,
  },
};

const februaryDetail = {
  ...januaryDetail,
  id: 'period-2025-2',
  month: 2,
  periodLabel: '2025年2账期',
  reportDate: '2025-02-28',
  importedAt: '2025-03-01T00:00:00.000Z',
  balanceSheet: {
    ...januaryDetail.balanceSheet,
    id: 'bs-2',
    periodId: 'period-2025-2',
    cashAndEquivalents: 180000,
    totalAssets: 420000,
    totalLiabilities: 110000,
    totalEquity: 310000,
  },
  incomeStatement: {
    ...januaryDetail.incomeStatement,
    id: 'is-2',
    periodId: 'period-2025-2',
    revenueMonth: 220000,
    netProfitMonth: 52000,
    revenueYTD: 380000,
    netProfitYTD: 90000,
  },
};

const periods = [
  {
    id: januaryDetail.id,
    year: januaryDetail.year,
    month: januaryDetail.month,
    periodLabel: januaryDetail.periodLabel,
    reportDate: januaryDetail.reportDate,
    importedAt: januaryDetail.importedAt,
    balanceSheet: januaryDetail.balanceSheet,
    incomeStatement: januaryDetail.incomeStatement,
  },
  {
    id: februaryDetail.id,
    year: februaryDetail.year,
    month: februaryDetail.month,
    periodLabel: februaryDetail.periodLabel,
    reportDate: februaryDetail.reportDate,
    importedAt: februaryDetail.importedAt,
    balanceSheet: februaryDetail.balanceSheet,
    incomeStatement: februaryDetail.incomeStatement,
  },
];

const analytics = {
  trends: [
    {
      label: '1月',
      month: 1,
      year: 2025,
      revenue: 160000,
      costOfSales: 90000,
      adminExpenses: 6000,
      financialExpenses: 3000,
      sellingExpenses: 7000,
      operatingProfit: 50000,
      netProfit: 38000,
      totalAssets: 350000,
      totalLiabilities: 65000,
      totalEquity: 285000,
      cash: 120000,
      debtRatio: 0.1857,
    },
    {
      label: '2月',
      month: 2,
      year: 2025,
      revenue: 220000,
      costOfSales: 120000,
      adminExpenses: 9000,
      financialExpenses: 4000,
      sellingExpenses: 10000,
      operatingProfit: 68000,
      netProfit: 52000,
      totalAssets: 420000,
      totalLiabilities: 110000,
      totalEquity: 310000,
      cash: 180000,
      debtRatio: 0.2619,
    },
  ],
  alerts: [
    {
      level: 'warning' as const,
      code: 'warning-receivable',
      message: '应收账款增长偏快',
      detail: '建议跟进账期回款情况',
    },
  ],
  historicalAlerts: [
    {
      level: 'danger' as const,
      code: 'danger-margin',
      message: '利润率低于阈值',
      detail: '2025年1账期净利润率偏低',
    },
  ],
  latestPeriod: {
    periodLabel: februaryDetail.periodLabel,
    balanceSheet: februaryDetail.balanceSheet,
    incomeStatement: februaryDetail.incomeStatement,
  },
  totalPeriods: 2,
};

describe('FinancialStatementsPage', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockGetAnalytics.mockReset();
    mockListStatements.mockReset();
    mockGetStatementDetail.mockReset();
    mockImportFromFolder.mockReset();
    mockImportFile.mockReset();
    mockCachedFetch.mockReset();
    mockInvalidateCache.mockReset();
    mockToastSuccess.mockReset();
    mockToastWarning.mockReset();
    mockToastError.mockReset();

    mockGetAnalytics.mockResolvedValue(analytics);
    mockListStatements.mockResolvedValue(periods);
    mockGetStatementDetail.mockImplementation(async (year: number, month: number) => {
      if (year === 2025 && month === 1) {
        return januaryDetail;
      }
      return februaryDetail;
    });
    mockImportFromFolder.mockResolvedValue({
      imported: 2,
      skipped: 0,
      errors: [],
    });
    mockImportFile.mockResolvedValue({
      message: '导入成功',
      data: {
        imported: 1,
        skipped: 0,
        errors: [],
      },
    });
    mockCachedFetch.mockImplementation(async (_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  it('加载后展示页面标题、tab 和历史预警', async () => {
    render(<FinancialStatementsPage />);

    expect(
      await screen.findByRole('heading', { name: '财务报表分析' }, { timeout: 10000 }),
    ).toBeInTheDocument();

    expect(screen.getByText('收益趋势')).toBeInTheDocument();
    expect(screen.getByText('费用结构')).toBeInTheDocument();
    expect(screen.getByText('资产负债')).toBeInTheDocument();
    expect(screen.getByText('账期详情')).toBeInTheDocument();
    expect(screen.getByText('历史预警记录')).toBeInTheDocument();
    expect(screen.getByText('利润率低于阈值')).toBeInTheDocument();
  });

  it('切换账期后会重新拉取对应详情', async () => {
    const user = userEvent.setup();
    render(<FinancialStatementsPage />);

    await waitFor(() => {
      expect(mockGetStatementDetail).toHaveBeenCalledWith(2025, 2);
    });

    const periodSelect = await screen.findByRole(
      'combobox',
      { name: '选择账期' },
      { timeout: 3000 },
    );
    await user.selectOptions(periodSelect, '2025-1');

    await waitFor(() => {
      expect(mockGetStatementDetail).toHaveBeenCalledWith(2025, 1);
    });
  });

  it('点击扫描导入全部会触发批量导入并失效缓存', async () => {
    const user = userEvent.setup();
    render(<FinancialStatementsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '扫描导入全部' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '扫描导入全部' }));

    await waitFor(() => {
      expect(mockImportFromFolder).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateCache).toHaveBeenCalledWith('fin-statements');
    expect(mockToastSuccess).toHaveBeenCalledWith('导入完成：成功 2 个账期，跳过 0 个');
  });

  it('上传 Excel 后会调用单文件导入接口', async () => {
    const user = userEvent.setup();
    render(<FinancialStatementsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '上传三表 Excel' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '上传三表 Excel' }));

    const file = new File(['excel'], 'finance.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await user.upload(screen.getByLabelText('选择 Excel 文件（.xlsx / .xls）'), file);
    await user.clear(screen.getByLabelText('账期年份'));
    await user.type(screen.getByLabelText('账期年份'), '2024');
    await user.clear(screen.getByLabelText('账期月份'));
    await user.type(screen.getByLabelText('账期月份'), '12');
    await user.click(screen.getByRole('button', { name: '解析并导入' }));

    await waitFor(() => {
      expect(mockImportFile).toHaveBeenCalledWith(file, 2024, 12, '2024年12账期');
    });

    expect(mockToastSuccess).toHaveBeenCalledWith('导入成功');
  });
});
