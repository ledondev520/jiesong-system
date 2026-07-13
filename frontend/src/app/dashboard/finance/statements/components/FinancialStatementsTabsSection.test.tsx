import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialStatementsTabsSection } from './FinancialStatementsTabsSection';
import type { FinancialPeriod } from '@/services/financialStatements.service';

const analytics = {
  trends: [
    {
      label: '2025-01', year: 2025, month: 1, revenue: 100000, costOfSales: 40000,
      adminExpenses: 10000, financialExpenses: 3000, sellingExpenses: 5000,
      operatingProfit: 42000, netProfit: 35000, totalAssets: 500000,
      totalLiabilities: 200000, totalEquity: 300000, cash: 80000, debtRatio: 0.4,
    },
  ],
  alerts: [], historicalAlerts: [], latestPeriod: null, totalPeriods: 1,
};

describe('FinancialStatementsTabsSection', () => {
  it('以页内区块展示报表下钻入口', () => {
    render(
      <FinancialStatementsTabsSection
        analytics={analytics}
        periods={[]}
        currentDetail={null}
        detailLoading={false}
      />,
    );

    expect(screen.getByTestId('financial-statements-drilldowns')).toBeInTheDocument();
    expect(document.querySelector('#finance-income-profit')).toBeInTheDocument();
    expect(document.querySelector('#finance-cost-structure')).toBeInTheDocument();
    expect(document.querySelector('#finance-balance')).toBeInTheDocument();
    expect(document.querySelector('#finance-period-detail')).toBeInTheDocument();
    expect(screen.getByText('收入与利润趋势')).toBeInTheDocument();
    expect(screen.getByText('成本结构')).toBeInTheDocument();
    expect(screen.getByText('资产负债')).toBeInTheDocument();
    expect(screen.getByText('账期详情')).toBeInTheDocument();
  });

  it('账期详情可复核现金流、科目余额、明细账和来源文件', () => {
    const currentDetail = {
      id: 'period-1', year: 2026, month: 6, periodLabel: '2026年6账期', reportDate: '2026-06-30', importedAt: '2026-07-13',
      balanceSheet: null,
      incomeStatement: null,
      cashFlowStatement: { netOperatingCashFlowMonth: -269382.51, endingCashMonth: 213263.58 },
      accountBalances: [{
        id: 'balance-1', sourceRow: 5, rowType: 'ACCOUNT', accountCode: '1002', accountName: '银行存款',
        openingDebit: 482646.09, openingCredit: 0, periodDebit: 122247.39, periodCredit: 391629.9,
        yearDebit: 4818060.03, yearCredit: 4677659.25, endingDebit: 213263.58, endingCredit: 0,
      }],
      generalLedgerEntries: [{
        id: 'ledger-1', sourceRow: 5, rowType: 'ENTRY', accountCode: '1002', accountName: '银行存款',
        entryDate: '2026-06-18', voucherNumber: '记-2', summary: '结汇', debit: 101379,
        credit: null, direction: '借', balance: 584025.09,
      }],
      dataSources: [{
        id: 'source-1', type: 'GENERAL_LEDGER', fileName: '2026年6期-6期_明细账.xlsx', fileSize: 31634,
        sha256: 'a'.repeat(64), sheetName: '明细账', rowCount: 571, importedAt: '2026-07-13',
      }],
    } as unknown as FinancialPeriod;

    render(
      <FinancialStatementsTabsSection
        analytics={analytics}
        periods={[]}
        currentDetail={currentDetail}
        detailLoading={false}
      />,
    );

    expect(screen.getByText('现金流量表')).toBeInTheDocument();
    expect(screen.getByText('科目余额表（1 行）')).toBeInTheDocument();
    expect(screen.getByText('明细账（1 行）')).toBeInTheDocument();
    expect(screen.getByText('来源校验（1 份）')).toBeInTheDocument();
    expect(screen.getByText('2026年6期-6期_明细账.xlsx')).toBeInTheDocument();
  });
});
