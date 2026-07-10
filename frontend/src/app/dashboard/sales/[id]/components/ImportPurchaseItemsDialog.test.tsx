/**
 * Input: 已完工采购明细、剩余箱数与当前出口合同
 * Output: 可选来源展示和按箱数导入 payload 测试
 * Pos: 装柜阶段采购来源导入对话框测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPurchaseItemsDialog } from './ImportPurchaseItemsDialog';

const mockGetAvailable = vi.fn();
const mockImport = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getAvailablePurchaseItems: (...args: unknown[]) => mockGetAvailable(...args),
    importPurchaseItems: (...args: unknown[]) => mockImport(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
  },
}));

describe('ImportPurchaseItemsDialog', () => {
  beforeEach(() => {
    mockGetAvailable.mockReset();
    mockImport.mockReset();
    mockToastSuccess.mockReset();
    mockGetAvailable.mockResolvedValue({
      data: [{
        id: 'pi-1',
        productId: 'p-1',
        quantity: 100,
        unit: '件',
        boxes: 10,
        grossWeight: 1000,
        netWeight: 950,
        volume: 5,
        specification: '标准箱',
        product: { id: 'p-1', customsName: '测试商品' },
        purchaseContract: {
          id: 'pc-1',
          contractNo: 'CG260001',
          supplier: { id: 'supplier-1', name: '测试供应商' },
        },
        allocated: { boxes: 4, quantity: 40, grossWeight: 400, netWeight: 380, volume: 2 },
        remaining: { boxes: 6, quantity: 60, grossWeight: 600, netWeight: 570, volume: 3 },
      }],
    });
    mockImport.mockResolvedValue({ data: { importedCount: 1, items: [] } });
  });

  it('展示采购来源剩余量并按选择箱数导入当前货柜', async () => {
    const onImported = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ImportPurchaseItemsDialog
        open
        onOpenChange={vi.fn()}
        salesContractId="sc-1"
        onImported={onImported}
      />,
    );

    expect(await screen.findByText('CG260001')).toBeInTheDocument();
    expect(screen.getByText('剩余 6 箱 · 600 kg · 3.00 CBM')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: '选择 CG260001 测试商品' }));
    fireEvent.change(screen.getByLabelText('导入箱数（测试商品）'), { target: { value: '4' } });
    await user.click(screen.getByRole('button', { name: '导入到当前货柜' }));

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledWith('sc-1', [{ purchaseItemId: 'pi-1', boxes: 4 }]);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('已导入 1 条装箱明细');
    expect(onImported).toHaveBeenCalled();
  });
});
