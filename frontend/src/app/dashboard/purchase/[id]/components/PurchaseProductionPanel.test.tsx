/**
 * Input: 生产中采购合同、生产资料完整性与生产实物图附件
 * Output: 缺项提示、标准化保存 payload 和选填照片入口测试
 * Pos: 采购生产阶段面板交互测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PurchaseContract } from '@/types';
import { PurchaseProductionPanel } from './PurchaseProductionPanel';

const mockUpdateProductionDetails = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    updateProductionDetails: (...args: unknown[]) => mockUpdateProductionDetails(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
  },
}));

const contract = {
  id: 'pc-1',
  contractNo: 'PO260001',
  supplierId: 'supplier-1',
  totalAmount: 1000,
  paidAmount: 300,
  taxRate: 13,
  status: 'PRODUCING',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  items: [{
    id: 'pi-1',
    purchaseContractId: 'pc-1',
    productId: 'product-1',
    quantity: 40,
    unit: '件',
    unitPrice: 10,
    totalPrice: 452,
    specification: '',
    boxes: null,
    grossWeight: null,
    netWeight: null,
    volume: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    product: { id: 'product-1', customsName: '测试瓷砖' },
  }],
  productionReadiness: {
    ready: false,
    itemCount: 1,
    incompleteItemCount: 1,
    estimatedDimensionItemCount: 1,
    totals: { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 },
    items: [{
      id: 'pi-1',
      ready: false,
      dimensionsEstimated: true,
      issues: [
        { code: 'MISSING_SPECIFICATION', label: '规格' },
        { code: 'MISSING_BOXES', label: '箱数' },
        { code: 'MISSING_GROSS_WEIGHT', label: '总毛重' },
        { code: 'MISSING_NET_WEIGHT', label: '总净重' },
        { code: 'MISSING_VOLUME', label: '总体积' },
      ],
    }],
  },
} as PurchaseContract;

describe('PurchaseProductionPanel', () => {
  beforeEach(() => {
    mockUpdateProductionDetails.mockReset();
    mockToastSuccess.mockReset();
    mockUpdateProductionDetails.mockResolvedValue({ data: contract });
  });

  it('集中展示生产资料缺项，并保留生产实物图选填入口', () => {
    render(
      <PurchaseProductionPanel
        contract={contract}
        photoFiles={[]}
        onPhotoFilesChange={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '生产与货物资料' })).toBeInTheDocument();
    expect(screen.getByText(/测试瓷砖：规格、箱数、总毛重、总净重、总体积/)).toBeInTheDocument();
    expect(screen.getByText('生产实物图（选填）')).toBeInTheDocument();
    expect(screen.getByLabelText('上传合同附件')).toHaveAttribute('accept', '.jpg,.jpeg,.png');
  });

  it('将规格、箱数、总毛净重、总体积和可选单箱尺寸一次保存', async () => {
    const onUpdated = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <PurchaseProductionPanel
        contract={contract}
        photoFiles={[]}
        onPhotoFilesChange={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    await user.click(screen.getByRole('button', { name: '录入生产资料' }));
    fireEvent.change(screen.getByLabelText('规格（测试瓷砖）'), { target: { value: '800×800mm，4片/箱' } });
    fireEvent.change(screen.getByLabelText('箱数（测试瓷砖）'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('总毛重（测试瓷砖）'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('总净重（测试瓷砖）'), { target: { value: '190' } });
    fireEvent.change(screen.getByLabelText('总体积（测试瓷砖）'), { target: { value: '1.8' } });
    fireEvent.change(screen.getByLabelText('单箱长度（测试瓷砖）'), { target: { value: '850' } });
    fireEvent.change(screen.getByLabelText('单箱宽度（测试瓷砖）'), { target: { value: '850' } });
    fireEvent.change(screen.getByLabelText('单箱高度（测试瓷砖）'), { target: { value: '120' } });
    await user.click(screen.getByRole('button', { name: '保存生产资料' }));

    await waitFor(() => {
      expect(mockUpdateProductionDetails).toHaveBeenCalledWith('pc-1', [{
        id: 'pi-1',
        specification: '800×800mm，4片/箱',
        boxes: 10,
        grossWeight: 200,
        netWeight: 190,
        volume: 1.8,
        length: 850,
        width: 850,
        height: 120,
      }]);
    });
    expect(onUpdated).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('生产资料已保存');
  });
});
