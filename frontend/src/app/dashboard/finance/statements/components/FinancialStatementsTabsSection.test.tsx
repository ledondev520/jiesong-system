import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialStatementsTabsSection } from './FinancialStatementsTabsSection';

describe('FinancialStatementsTabsSection', () => {
  it('以页内区块展示报表下钻入口', () => {
    render(
      <FinancialStatementsTabsSection
        analytics={{
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
          latestPeriod: null,
          totalPeriods: 1,
        }}
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
});
