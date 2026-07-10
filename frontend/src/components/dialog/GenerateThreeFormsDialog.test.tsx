/**
 * Input: 三表生成对话框、后端出口准备度与 HS 建议服务
 * Output: 历史 HS 优先、全量装箱行门禁和无退税警示交互测试
 * Pos: 出口单证确认 Module 交互测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenerateThreeFormsDialog } from './GenerateThreeFormsDialog';

const mockPreview = vi.fn();
const mockGenerate = vi.fn();
const mockDownload = vi.fn();
const mockBatchMatch = vi.fn();

vi.mock('@/services/threeForms.service', () => ({
  threeFormsService: {
    previewThreeForms: (...args: unknown[]) => mockPreview(...args),
    generateThreeForms: (...args: unknown[]) => mockGenerate(...args),
    downloadExcel: (...args: unknown[]) => mockDownload(...args),
  },
}));

vi.mock('@/services/hsCode.service', () => ({
  hsCodeService: {
    batchMatch: (...args: unknown[]) => mockBatchMatch(...args),
  },
}));

const packingItem = (id: string, productId: string, productName: string, hsCode: string | null) => ({
  id,
  salesContractId: 'sc-1',
  productId,
  quantity: 10,
  unit: '件',
  boxes: 2,
  grossWeight: 100,
  netWeight: 90,
  volume: 1,
  unitPrice: 20,
  totalPrice: 200,
  purchaseCost: 1130,
  product: {
    id: productId,
    customsName: productName,
    hsCode,
    declaration: '品牌类型:0|用途:建筑铺面',
    unit: '件',
  },
});

const readinessLine = (overrides: Record<string, unknown>) => ({
  packingItemId: 'pk-1',
  productId: 'p-1',
  productName: '抛光砖',
  quantity: 10,
  unit: '件',
  hsCode: '6907219000',
  hsSource: 'customs_history',
  hsEvidence: {
    productName: '陶瓷砖',
    refundRate: 13,
    vatRate: 13,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    fetchedAt: '2026-03-08T00:00:00.000Z',
    sourceUrl: 'https://example.test/hs',
  },
  declarationElements: '品牌类型:0|用途:建筑铺面',
  declarationTemplate: '品牌类型|用途',
  unitPriceUsd: 20,
  totalPriceUsd: 200,
  storedTotalPriceUsd: 200,
  recommendedUnitPriceUsd: 20.4,
  pricingFormula: 'purchaseCostCny × 1.3 ÷ exchangeRate ÷ quantity',
  pricingProfitRate: 1.3,
  exchangeRate: 7.2,
  purchaseCostCny: 1130,
  purchaseVatRate: 13,
  refundBaseCny: 1000,
  estimatedRefundCny: 130,
  nonRefundableInputTaxCny: 0,
  issues: [],
  ...overrides,
});

const contract = (packingItems: ReturnType<typeof packingItem>[]) => ({
  id: 'sc-1',
  contractNo: 'EXP260001',
  status: 'PACKING',
  exchangeRate: 7.2,
  totalAmount: 200,
  receivedAmount: 0,
  totalBoxes: 2,
  grossWeight: 100,
  netWeight: 90,
  volume: 1,
  packingItems,
});

describe('GenerateThreeFormsDialog', () => {
  beforeEach(() => {
    mockPreview.mockReset();
    mockGenerate.mockReset();
    mockDownload.mockReset();
    mockBatchMatch.mockReset();
    mockDownload.mockResolvedValue(undefined);
  });

  it('优先展示历史报关 HS，任一装箱行缺资料时禁止生成，不能静默过滤', async () => {
    const first = packingItem('pk-1', 'p-1', '抛光砖', '6907229000');
    const second = packingItem('pk-2', 'p-2', '玻璃杯', null);
    const missingIssue = {
      code: 'MISSING_HS_CODE',
      severity: 'error',
      scope: 'all',
      message: '缺少 10 位 HS 编码',
      packingItemId: 'pk-2',
      productName: '玻璃杯',
    };
    mockPreview.mockResolvedValue({
      data: {
        contractId: 'sc-1',
        contractNo: 'EXP260001',
        exchangeRate: 7.2,
        profitRate: 1.3,
        customsReady: false,
        taxRefundReady: false,
        lines: [
          readinessLine({}),
          readinessLine({
            packingItemId: 'pk-2',
            productId: 'p-2',
            productName: '玻璃杯',
            hsCode: '',
            hsSource: 'missing',
            hsEvidence: null,
            issues: [missingIssue],
          }),
        ],
        issues: [missingIssue],
        summary: {
          lineCount: 2,
          totalExportAmountUsd: 400,
          storedContractTotalUsd: 200,
          totalPurchaseCostCny: 2260,
          totalRefundBaseCny: 1000,
          totalEstimatedRefundCny: 130,
          totalNonRefundableInputTaxCny: 0,
          noRefundLineCount: 0,
          errorCount: 1,
          warningCount: 0,
        },
      },
    });

    render(
      <GenerateThreeFormsDialog
        open
        onOpenChange={vi.fn()}
        salesContract={contract([first, second]) as never}
      />,
    );

    expect(await screen.findByDisplayValue('6907219000')).toBeInTheDocument();
    expect(screen.getByText('历史报关')).toBeInTheDocument();
    expect(screen.getAllByText('缺少 10 位 HS 编码').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /确认生成/ })).toBeDisabled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('资料完整时提交全部装箱行，并保留0%无退税警示', async () => {
    const item = packingItem('pk-1', 'p-1', '抛光砖', '6907219000');
    const noRefundIssue = {
      code: 'NO_EXPORT_REFUND',
      severity: 'warning',
      scope: 'tax_refund',
      message: '当前退税率为 0%，该商品货值无法申请出口退税',
      packingItemId: 'pk-1',
      productName: '抛光砖',
    };
    mockPreview.mockResolvedValue({
      data: {
        contractId: 'sc-1',
        contractNo: 'EXP260001',
        exchangeRate: 7.2,
        profitRate: 1.3,
        customsReady: true,
        taxRefundReady: true,
        lines: [readinessLine({
          hsEvidence: {
            productName: '陶瓷砖',
            refundRate: 0,
            vatRate: 13,
            effectiveDate: '2026-01-01T00:00:00.000Z',
            fetchedAt: null,
            sourceUrl: null,
          },
          estimatedRefundCny: 0,
          issues: [noRefundIssue],
        })],
        issues: [noRefundIssue],
        summary: {
          lineCount: 1,
          totalExportAmountUsd: 200,
          storedContractTotalUsd: 200,
          totalPurchaseCostCny: 1130,
          totalRefundBaseCny: 1000,
          totalEstimatedRefundCny: 0,
          totalNonRefundableInputTaxCny: 130,
          noRefundLineCount: 1,
          errorCount: 0,
          warningCount: 1,
        },
      },
    });
    mockGenerate.mockResolvedValue({
      data: {
        customsDeclarationId: 'cd-1',
        forexId: 'fv-1',
        taxRefundId: 'tr-1',
        warnings: [noRefundIssue],
      },
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <GenerateThreeFormsDialog
        open
        onOpenChange={onOpenChange}
        salesContract={contract([item]) as never}
      />,
    );

    expect(await screen.findByText(/1 个商品无出口退税/)).toBeInTheDocument();
    const generateButton = screen.getByRole('button', { name: /确认生成/ });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    const submitted = mockGenerate.mock.calls[0][0];
    expect(submitted.items).toHaveLength(1);
    expect(submitted.items[0]).toMatchObject({
      packingItemId: 'pk-1',
      hsCode: '6907219000',
      hsSource: 'history',
    });
    expect(mockDownload).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
