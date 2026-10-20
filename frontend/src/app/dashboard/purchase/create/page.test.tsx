/**
 * Input: 采购创建页、purchase/supplier/product 服务、toast、router
 * Output: 采购创建页基础交互测试结果
 * Pos: 前端创建页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatePurchasePage from './page';

const mockPush = vi.fn();
let mockEditId: string | null = null;
const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();
const mockToastWarning = vi.fn();
const mockGetSuppliers = vi.fn();
const mockGetProducts = vi.fn();
const mockGetNextContractNo = vi.fn();
const mockGetSuppliersByProducts = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockEditId ? { editId: mockEditId } : {}),
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/supplier.service', () => ({
  supplierService: {
    getAll: (...args: unknown[]) => mockGetSuppliers(...args),
    create: vi.fn(),
  },
}));

vi.mock('@/components/purchase/PriceGuard', () => ({ PriceGuard: () => null }));

vi.mock('@/services/product.service', () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetProducts(...args),
  },
}));

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    getNextContractNo: (...args: unknown[]) => mockGetNextContractNo(...args),
    getSuppliersByProducts: (...args: unknown[]) => mockGetSuppliersByProducts(...args),
    parseQuote: vi.fn(),
    create: (...args: unknown[]) => mockCreate(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

describe('CreatePurchasePage 交互逻辑', () => {
  beforeEach(() => {
    mockEditId = null;
    mockGetById.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
    mockToastWarning.mockReset();
    mockGetSuppliers.mockReset();
    mockGetProducts.mockReset();
    mockGetNextContractNo.mockReset();
    mockGetSuppliersByProducts.mockReset();
    mockToastError.mockReset();
  });

  it('加载成功后展示创建页关键元素', async () => {
    mockGetSuppliers.mockResolvedValue({ data: { items: [] } });
    mockGetProducts.mockResolvedValue({ data: { items: [] } });
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'CG2600001' } });
    mockGetSuppliersByProducts.mockResolvedValue({ data: { supplierIds: [] } });

    render(<CreatePurchasePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '新增采购合同' })).toBeInTheDocument();
      expect(screen.getByText('AI 智能录入')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /解析报价/ })).toBeInTheDocument();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetSuppliers.mockRejectedValue(new Error('load failed'));
    mockGetProducts.mockResolvedValue({ data: { items: [] } });
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'CG2600001' } });
    mockGetSuppliersByProducts.mockResolvedValue({ data: { supplierIds: [] } });

    render(<CreatePurchasePage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载数据失败');
    });
  });

  it('顶部前进也校验明细，错误留在采购明细步骤', async () => {
    mockGetSuppliers.mockResolvedValue({ data: { items: [] } });
    mockGetProducts.mockResolvedValue({ data: { items: [] } });
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'CG2600001' } });
    render(<CreatePurchasePage />);
    await userEvent.click(screen.getAllByRole('button', { name: /合同信息/ })[0]);
    expect(await screen.findByText('请选择商品')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '供应商 *' })).not.toBeInTheDocument();
  });

  it('草稿更正复用完整目录，保存既有交期和修改后的数量', async () => {
    mockEditId = 'draft-1';
    mockGetSuppliers.mockResolvedValue({ data: { items: [{ id: 'supplier-1', name: '合成供应商' }] } });
    mockGetProducts.mockResolvedValue({ data: { items: [{ id: 'product-1', customsName: '合成商品' }] } });
    mockGetById.mockResolvedValue({ data: { id: 'draft-1', status: 'DRAFT', contractNo: 'synthetic', supplierId: 'supplier-1', taxRate: 13, expectedDate: '2026-10-20T00:00:00.000Z', items: [{ productId: 'product-1', quantity: 1, unitPrice: 100 }] } });
    mockUpdate.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '数量 *' })).toHaveValue(1));
    const quantity = screen.getByRole('spinbutton', { name: '数量 *' });
    await user.clear(quantity);
    await user.type(quantity, '2');
    await user.click(screen.getAllByRole('button', { name: /合同信息/ })[0]);
    expect(await screen.findByLabelText('预计交期')).toHaveTextContent('2026-10-20');
    await user.click(screen.getByRole('button', { name: '保存更正' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('draft-1', expect.objectContaining({ expectedDate: '2026-10-20T00:00:00.000Z', items: [expect.objectContaining({ productId: 'product-1', quantity: 2 })] })));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/draft-1');
  });

  it('创建成功仍向采购员展示后端价格预警', async () => {
    mockGetSuppliers.mockResolvedValue({ data: { items: [{ id: 'supplier-1', name: '合成供应商' }] } });
    mockGetProducts.mockResolvedValue({ data: { items: [{ id: 'product-1', customsName: '合成商品' }] } });
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'synthetic' } });
    mockCreate.mockResolvedValue({ data: { contract: { id: 'new-1' }, warnings: [{ message: '合成价格预警' }] } });
    const user = userEvent.setup();
    render(<CreatePurchasePage />);
    await user.click(await screen.findByRole('combobox', { name: '商品 *' }));
    await user.click(await screen.findByRole('option', { name: '合成商品' }));
    await user.type(screen.getByRole('spinbutton', { name: '数量 *' }), '1');
    await user.click(screen.getAllByRole('button', { name: /合同信息/ })[0]);
    await user.click(await screen.findByRole('combobox', { name: '供应商 *' }));
    await user.click(await screen.findByRole('option', { name: '合成供应商' }));
    await user.click(screen.getByRole('button', { name: '创建合同' }));
    await waitFor(() => expect(mockToastWarning).toHaveBeenCalledWith('合成价格预警', { duration: 10000 }));
  });

  it('关键表单字段具备正确的标签关联与 id/name 属性', async () => {
    const user = userEvent.setup();

    mockGetSuppliers.mockResolvedValue({
      data: {
        items: [
          {
            id: 'supplier-1',
            name: '佛山市测试供应商',
            contactName: '张经理',
          },
        ],
      },
    });
    mockGetProducts.mockResolvedValue({ data: { items: [{ id: 'product-1', customsName: '合成商品' }] } });
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'CG2600001' } });
    mockGetSuppliersByProducts.mockResolvedValue({ data: { supplierIds: [] } });

    render(<CreatePurchasePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '新增采购合同' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('采购报价原文')).toHaveAttribute('name', 'quoteText');

    await user.click(screen.getByRole('combobox', { name: '商品 *' }));
    await user.click(await screen.findByRole('option', { name: '合成商品' }));
    await user.type(screen.getByRole('spinbutton', { name: '数量 *' }), '1');
    await user.click(screen.getAllByRole('button', { name: /合同信息/ })[0]);

    await user.click(await screen.findByRole('combobox', { name: '供应商 *' }));
    expect(screen.getByLabelText('搜索供应商')).toHaveAttribute('name', 'supplierSearch');

    await user.click(screen.getByRole('button', { name: /新增/ }));

    expect(screen.getByLabelText('供应商名称 *')).toHaveAttribute('name', 'name');
    expect(screen.getByLabelText('联系人')).toHaveAttribute('name', 'contactName');
    expect(screen.getByLabelText('联系电话')).toHaveAttribute('name', 'contactPhone');
    expect(screen.getByLabelText('公司地址')).toHaveAttribute('name', 'address');
    expect(screen.getByLabelText('纳税人识别号')).toHaveAttribute('name', 'taxId');
    expect(screen.getByLabelText('收款户名')).toHaveAttribute('name', 'bankAccountName');
    expect(screen.getByLabelText('开户银行')).toHaveAttribute('name', 'bankName');
    expect(screen.getByLabelText('开户支行')).toHaveAttribute('name', 'bankBranch');
    expect(screen.getByLabelText('联行号 / 银行编号')).toHaveAttribute('name', 'bankCode');
    expect(screen.getByLabelText('银行账号')).toHaveAttribute('name', 'bankAccount');

    const labelsWithTargets = Array.from(document.querySelectorAll('label[for]'));
    expect(labelsWithTargets.length).toBeGreaterThan(0);

    for (const label of labelsWithTargets) {
      const htmlFor = label.getAttribute('for');
      expect(htmlFor).toBeTruthy();
      expect(document.getElementById(htmlFor!)).not.toBeNull();
    }
  });
});
