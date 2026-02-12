/**
 * Input: 采购创建页、purchase/supplier/product 服务、toast、router
 * Output: 采购创建页基础交互测试结果
 * Pos: 前端创建页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});

