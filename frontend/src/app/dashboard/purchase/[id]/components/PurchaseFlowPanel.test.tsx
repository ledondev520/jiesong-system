/**
 * Input: PurchaseFlowPanel、采购发票准备 Interface 与附件上传 mock
 * Output: 催票、规范化号码登记和选填发票附件交互测试
 * Pos: 采购详情供应商发票闭环测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseFlowPanel } from './PurchaseFlowPanel';
import type { PurchaseContract } from '@/types';

const mockIsMobile = vi.fn(() => false);
vi.mock('@/lib/hooks/useMobile', () => ({ useMobile: () => mockIsMobile() }));

const mockGetPreparation = vi.fn();
const mockRegisterNumbers = vi.fn();
const mockUploadFile = vi.fn();

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    getInvoicePreparation: (...args: unknown[]) => mockGetPreparation(...args),
    registerInvoiceNumbers: (...args: unknown[]) => mockRegisterNumbers(...args),
  },
}));

vi.mock('@/services/contractFile.service', () => ({
  uploadContractFile: (...args: unknown[]) => mockUploadFile(...args),
}));

vi.mock('@/services/finance.service', () => ({
  financeService: { createPayment: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const preparation = {
  purchaseContractId: 'purchase-1',
  complete: true,
  fileRequired: false as const,
  invoiceNumbers: ['INV-001'],
  invoiceFiles: [{
    id: 'file-1',
    fileName: '发票.pdf',
    fileType: 'application/pdf',
    mimeType: 'application/pdf',
    fileSize: 100,
    filePath: 'invoice.pdf',
    category: 'SUPPLIER_INVOICE' as const,
    uploadedAt: '2026-07-06T00:00:00.000Z',
  }],
  issues: [],
  amounts: { taxRate: 13, netAmount: 200, taxAmount: 26, grossAmount: 226 },
  request: {
    contractNo: 'CG260001',
    supplierName: '供应商A',
    supplierTaxId: '91310000TEST000001',
    lines: [{
      purchaseItemId: 'item-1',
      productId: 'product-1',
      productName: '餐盘',
      unit: '件',
      quantity: 2,
      netUnitPrice: 100,
      netAmount: 200,
      taxRate: 13,
      taxAmount: 26,
      grossAmount: 226,
    }],
  },
};

const contract = {
  id: 'purchase-1',
  contractNo: 'PO260001',
  supplierId: 'supplier-1',
  totalAmount: 226,
  paidAmount: 226,
  taxRate: 13,
  status: 'SHIPPED',
  invoiceNo: 'INV-001',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z',
  supplier: { id: 'supplier-1', name: '供应商A' },
  items: [{
    id: 'item-1',
    purchaseContractId: 'purchase-1',
    productId: 'product-1',
    quantity: 2,
    unit: '件',
    unitPrice: 100,
    totalPrice: 226,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    product: { id: 'product-1', customsName: '餐盘', unit: '件' },
  }],
  payments: [],
} as unknown as PurchaseContract;

describe('PurchaseFlowPanel supplier invoice flow', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    vi.clearAllMocks();
    mockGetPreparation.mockResolvedValue({ data: preparation });
    mockRegisterNumbers.mockResolvedValue({
      data: { ...preparation, invoiceNumbers: ['INV-002', 'INV-003'] },
    });
    mockUploadFile.mockResolvedValue({
      data: { ...preparation.invoiceFiles[0], id: 'file-2', fileName: '新发票.pdf' },
    });
  });

  it('手机付款卡片完整显示金额、日期、方式和备注', () => {
    mockIsMobile.mockReturnValue(true);
    render(<PurchaseFlowPanel contract={{ ...contract, payments: [{ id: 'payment-1', paymentDate: '2026-07-06T00:00:00.000Z', amount: 100, paymentMethod: '转账', note: '手机付款备注' }] } as PurchaseContract} onUpdated={vi.fn()} />);
    expect(screen.getByText('2026-07-06')).toBeInTheDocument();
    expect(screen.getByText('转账')).toBeInTheDocument();
    expect(screen.getByText('手机付款备注')).toBeInTheDocument();
    expect(screen.getByText('¥100.00')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('打开催票弹窗时读取权威准备状态，并通过专用入口保存多个号码', async () => {
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<PurchaseFlowPanel contract={contract} onUpdated={onUpdated} invoiceTitleInfo="购方：捷淞" />);

    await user.click(screen.getByRole('button', { name: '催开发票' }));

    expect(await screen.findByText('发票.pdf')).toBeInTheDocument();
    expect(mockGetPreparation).toHaveBeenCalledWith('purchase-1');
    const input = screen.getByLabelText('发票号码登记（每行或逗号分隔）');
    fireEvent.change(input, { target: { value: 'INV-002\nINV-003' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(mockRegisterNumbers).toHaveBeenCalledWith('purchase-1', ['INV-002', 'INV-003']);
    expect(onUpdated).toHaveBeenCalled();
  });

  it('发票文件在同一弹窗直接按 SUPPLIER_INVOICE 分类上传，且文件仍为选填', async () => {
    const onUpdated = vi.fn();
    const user = userEvent.setup();
    render(<PurchaseFlowPanel contract={contract} onUpdated={onUpdated} />);
    await user.click(screen.getByRole('button', { name: '催开发票' }));
    await screen.findByText('发票.pdf');

    const file = new File(['invoice'], '新发票.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('上传供应商发票原件'), { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUploadFile).toHaveBeenCalledWith(
        'purchase-1',
        'PURCHASE',
        file,
        '供应商发票原件（选填）',
        'SUPPLIER_INVOICE',
      );
    });
    expect(onUpdated).toHaveBeenCalled();
  });
});
