/**
 * Input: 美元经营应收与会计应收差异响应
 * Output: 重复、漏记和剩余折算差展示测试
 * Pos: 客户美元应收对账卡片测试
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceivableReconciliationCard } from './ReceivableReconciliationCard';

vi.mock('@/services/finance.service', () => ({
  financeService: {
    getReceivableReconciliation: vi.fn(async () => ({
      period: { year: 2026, month: 7, label: '2026年7账期' },
      cutoffDate: '2026-07-31',
      contractCount: 44,
      formalSalesUsd: 2024295.10,
      receivedUsd: 1738132.60,
      operatingReceivableUsd: 286162.50,
      reportedReceivableCny: 2180207.79,
      effectiveExchangeRate: 6.8067,
      translatedOperatingReceivableCny: 1947822.32,
      correctedAccountingReceivableCny: 1930769.46,
      residualCny: -17052.86,
      anomalies: {
        duplicateDebitCny: 437766.11,
        duplicateContracts: ['EXP260008'],
        missingDebitCny: 188327.78,
        missingContracts: [{ contractNo: 'EXP260009', amountUsd: 27668, estimatedAmountCny: 188327.78 }],
      },
      assumptions: [],
    })),
  },
}));

describe('ReceivableReconciliationCard', () => {
  it('展示经营应收、报表应收和两类会计异常', async () => {
    render(<ReceivableReconciliationCard year={2026} month={7} />);

    expect(await screen.findByTestId('receivable-reconciliation-card')).toBeInTheDocument();
    expect(screen.getByText('$286,162.50')).toBeInTheDocument();
    expect(screen.getByText(/重复确认：EXP260008/)).toBeInTheDocument();
    expect(screen.getByText(/漏确认：EXP260009/)).toBeInTheDocument();
    expect(screen.getByText('-¥17,052.86')).toBeInTheDocument();
  });
});
