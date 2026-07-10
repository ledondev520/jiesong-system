/**
 * Input: SalesFinancePanel、单柜财务汇总与美元收款写入 mock
 * Output: 统一财务口径展示和直接登记回款交互测试
 * Pos: 出口专项单财务结算主界面测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesFinancePanel } from './SalesFinancePanel';

const mockGetFinanceSummary = vi.fn();
const mockCreatePayment = vi.fn();

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getFinanceSummary: (...args: unknown[]) => mockGetFinanceSummary(...args),
  },
}));

vi.mock('@/services/finance.service', () => ({
  financeService: {
    createPayment: (...args: unknown[]) => mockCreatePayment(...args),
  },
}));

vi.mock('@/app/dashboard/finance/components/PaymentDialog', () => ({
  PaymentDialog: ({
    open,
    currency,
    onSubmit,
  }: {
    open: boolean;
    currency: string;
    onSubmit: (data: {
      amount: number;
      paymentDate: Date;
      paymentMethod: string;
      note?: string;
    }) => Promise<void>;
  }) => open ? (
    <div>
      <span>登记币种 {currency}</span>
      <button
        type="button"
        onClick={() => void onSubmit({
          amount: 150,
          paymentDate: new Date('2026-07-10T00:00:00.000Z'),
          paymentMethod: 'bank',
          note: '尾款',
        })}
      >
        提交测试收款
      </button>
    </div>
  ) : null,
}));

const summary = {
  salesContractId: 'sales-1',
  contractNo: 'EXP260001',
  currencyPolicy: {
    salesReceiptCurrency: 'USD',
    purchasePaymentCurrency: 'CNY',
    conversionRate: 7,
  },
  marginReady: true,
  cashReady: true,
  revenue: {
    contractTotalUsd: 1000,
    ownedRevenueUsd: 600,
    receivedUsd: 240,
    outstandingUsd: 360,
    receivedSource: 'payment_records' as const,
  },
  cost: {
    purchaseCostCny: 3000,
    paidPurchaseCostCny: 1500,
    outstandingPurchaseCostCny: 1500,
  },
  tax: { estimatedRefundCny: 200, actualRefundedCny: 100 },
  profit: {
    expectedRevenueCny: 4200,
    estimatedGrossProfitCny: 1400,
    estimatedGrossMarginPct: 33.33,
    scope: '商品口径说明',
  },
  cashFlow: {
    customerReceiptsCny: 1680,
    actualTaxRefundCny: 100,
    supplierPaymentsCny: 1500,
    netCashCny: 280,
  },
  receipts: [{
    id: 'receipt-1',
    amountUsd: 240,
    paymentDate: '2026-07-01T00:00:00.000Z',
    paymentMethod: 'bank',
    note: '定金',
  }],
  linkedPurchases: [{
    id: 'purchase-1',
    contractNo: 'CG260001',
    supplierName: '供应商A',
    allocatedCostCny: 3000,
    allocatedPaidCny: 1500,
    outstandingCny: 1500,
    allocationRatioPct: 100,
    lastPaymentAt: '2026-06-10T00:00:00.000Z',
  }],
  issues: [{ code: 'THIRD_PARTY_REVENUE_EXCLUDED', severity: 'info' as const, message: '已排除第三方拼柜收入' }],
};

describe('SalesFinancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFinanceSummary.mockResolvedValue({ data: summary });
    mockCreatePayment.mockResolvedValue({ data: { id: 'receipt-new' } });
  });

  it('在一张界面展示美元收入、人民币成本、退税、商品毛利与现金流', async () => {
    render(<SalesFinancePanel salesContractId="sales-1" contractNo="EXP260001" />);

    expect(await screen.findByRole('heading', { name: '单柜财务结算' })).toBeInTheDocument();
    expect(screen.getByText('USD 600.00')).toBeInTheDocument();
    expect(screen.getAllByText('CNY 3,000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('CNY 1,400.00')).toBeInTheDocument();
    expect(screen.getByText('33.33%')).toBeInTheDocument();
    expect(screen.getByText('已排除第三方拼柜收入')).toBeInTheDocument();
    expect(screen.getAllByText('供应商A').length).toBeGreaterThan(0);
  });

  it('从本柜直接登记 USD 回款并刷新统一汇总', async () => {
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <SalesFinancePanel
        salesContractId="sales-1"
        contractNo="EXP260001"
        onChanged={onChanged}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '登记美元收款' }));
    expect(screen.getByText('登记币种 USD')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '提交测试收款' }));

    await waitFor(() => {
      expect(mockCreatePayment).toHaveBeenCalledWith({
        type: 'RECEIVABLE',
        salesContractId: 'sales-1',
        amount: 150,
        currency: 'USD',
        paymentMethod: 'bank',
        paymentDate: '2026-07-10T00:00:00.000Z',
        note: '尾款',
      });
      expect(mockGetFinanceSummary).toHaveBeenCalledTimes(2);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });
});
