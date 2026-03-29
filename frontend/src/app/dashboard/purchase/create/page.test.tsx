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
const mockGetSuppliers = vi.fn();
const mockGetProducts = vi.fn();
const mockGetNextContractNo = vi.fn();
const mockGetSuppliersByProducts = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
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
    create: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('CreatePurchasePage 交互逻辑', () => {
  beforeEach(() => {
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
    mockGetProducts.mockResolvedValue({ data: { items: [] } });
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'CG2600001' } });
    mockGetSuppliersByProducts.mockResolvedValue({ data: { supplierIds: [] } });

    render(<CreatePurchasePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '新增采购合同' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('采购报价原文')).toHaveAttribute('name', 'quoteText');

    await user.click(screen.getByRole('combobox', { name: '供应商' }));
    expect(screen.getByLabelText('搜索供应商')).toHaveAttribute('name', 'supplierSearch');

    await user.click(screen.getByRole('button', { name: /新增/ }));

    expect(screen.getByLabelText('供应商名称 *')).toHaveAttribute('name', 'name');
    expect(screen.getByLabelText('联系人')).toHaveAttribute('name', 'contactName');
    expect(screen.getByLabelText('联系电话')).toHaveAttribute('name', 'contactPhone');
    expect(screen.getByLabelText('公司地址')).toHaveAttribute('name', 'address');
    expect(screen.getByLabelText('纳税人识别号')).toHaveAttribute('name', 'taxId');
    expect(screen.getByLabelText('开户银行')).toHaveAttribute('name', 'bankName');
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
