/**
 * Input: TaxRefundPreparationDialog 与 salesService mock
 * Output: 规则版本、阻塞清单和 Excel 导出交互测试
 * Pos: 出口详情退税材料准备 Module 测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaxRefundPreparationDialog } from './TaxRefundPreparationDialog';

const mockGetPreparation = vi.fn();
const mockExportPreparation = vi.fn();

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getTaxRefundPreparation: (...args: unknown[]) => mockGetPreparation(...args),
    exportTaxRefundPreparation: (...args: unknown[]) => mockExportPreparation(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const preparation = {
  salesContractId: 'sales-1',
  contractNo: 'EXP260001',
  preparationReady: false,
  collectionReady: false,
  checklist: [{
    id: 'supplier-invoices',
    label: '增值税专用发票（购进凭证）',
    category: '申报凭证',
    requirement: 'required' as const,
    status: 'missing' as const,
    evidence: null,
    message: '仍有采购合同未登记供应商发票号码',
  }],
  blockers: ['仍有采购合同未登记供应商发票号码'],
  warnings: [],
  invoiceLinks: [{
    purchaseContractId: 'purchase-1',
    purchaseContractNo: 'CG260001',
    supplierName: '供应商A',
    supplierTaxId: '91310000TEST000001',
    invoiceNumbers: [],
    invoiceFileCount: 0,
    invoiceFileRequired: false as const,
    taxRate: 13,
    netAmount: 200,
    taxAmount: 26,
    grossAmount: 226,
  }],
  deadlines: {
    basisDate: '2026-06-20',
    filingStart: '2026-07-01',
    internalPrepareOn: '2026-07-05',
    primaryFilingEnd: '2027-04-30',
    collectionDeadline: '2027-04-30',
    supplementaryWindowEnd: '2029-06-20',
    filingArchiveDueRule: '实际申报后15日内',
    retentionYears: 10,
  },
  officialRules: {
    effectiveFrom: '2026-01-01',
    policyDocument: '财政部 税务总局公告2026年第11号',
    managementDocument: '国家税务总局公告2026年第5号',
    filingRule: '报关出口次月起至次年4月30日前的各增值税纳税申报期',
    externalTradeMaterials: '申报材料',
    filingArchiveRule: '申报后15日内整理备案单证目录，保存10年',
    collectionRule: '次年4月30日前收汇',
    internalReminderDisclaimer: '次月5日仅为本系统内部准备节点，不是法定申报截止日。',
    sources: {
      policy: 'https://example.com/policy',
      management: 'https://example.com/management',
      interpretation: 'https://example.com/interpretation',
    },
  },
  disclaimer: '本清单不代表已完成正式申报。',
};

describe('TaxRefundPreparationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPreparation.mockResolvedValue({ data: preparation });
    mockExportPreparation.mockResolvedValue(undefined);
  });

  it('展示当前公告版本、内部5日声明、法定期限和材料阻塞', async () => {
    render(
      <TaxRefundPreparationDialog
        open
        onOpenChange={vi.fn()}
        salesContractId="sales-1"
        contractNo="EXP260001"
      />,
    );

    expect(await screen.findByText(/财政部 税务总局公告2026年第11号/)).toBeInTheDocument();
    expect(screen.getByText('2026-07-05')).toBeInTheDocument();
    expect(screen.getByText('2027-04-30')).toBeInTheDocument();
    expect(screen.getAllByText(/仍有采购合同未登记供应商发票号码/).length).toBeGreaterThan(0);
    expect(screen.getByText(/不是法定申报截止日/)).toBeInTheDocument();
    expect(mockGetPreparation).toHaveBeenCalledWith('sales-1');
  });

  it('可导出内部材料准备 Excel', async () => {
    const user = userEvent.setup();
    render(
      <TaxRefundPreparationDialog
        open
        onOpenChange={vi.fn()}
        salesContractId="sales-1"
        contractNo="EXP260001"
      />,
    );
    await screen.findByText(/财政部 税务总局公告2026年第11号/);
    await user.click(screen.getByRole('button', { name: '导出材料准备 Excel' }));

    expect(mockExportPreparation).toHaveBeenCalledWith('sales-1', 'EXP260001');
  });
});
