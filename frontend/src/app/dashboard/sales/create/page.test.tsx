/**
 * Input: 销售创建页、products/stores/sales 服务、toast、router
 * Output: 销售创建页基础交互测试结果
 * Pos: 前端创建页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateSalesPage from './page';

const mockPush = vi.fn();
const mockGetProducts = vi.fn();
const mockGetStores = vi.fn();
const mockGetNextContractNo = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/product.service', () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetProducts(...args),
  },
}));

vi.mock('@/services/store.service', () => ({
  storeService: {
    getAll: (...args: unknown[]) => mockGetStores(...args),
  },
}));

vi.mock('@/services/sales.service', () => ({
  salesService: {
    calculatePrice: vi.fn(() => 0),
    getNextContractNo: (...args: unknown[]) => mockGetNextContractNo(...args),
    create: vi.fn(),
    addItem: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('CreateSalesPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetProducts.mockReset();
    mockGetStores.mockReset();
    mockGetNextContractNo.mockReset();
    mockToastError.mockReset();
    mockGetNextContractNo.mockResolvedValue({ data: { contractNo: 'EXP2600001' } });
  });

  it('加载成功后展示创建页关键元素', async () => {
    mockGetProducts.mockResolvedValue({ data: { items: [] } });
    mockGetStores.mockResolvedValue({ data: { items: [] } });

    render(<CreateSalesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '创建出口合同' })).toBeInTheDocument();
      expect(screen.getAllByText('基本信息').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /下一步/ })).toBeInTheDocument();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetProducts.mockRejectedValue(new Error('load failed'));
    mockGetStores.mockResolvedValue({ data: { items: [] } });

    render(<CreateSalesPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载商品和门店数据失败');
    });
  });

  it('空表单提交后显示字段级校验提示', async () => {
    mockGetProducts.mockResolvedValue({ data: { items: [{ id: 'prod-1', customsName: '瓷砖' }] } });
    mockGetStores.mockResolvedValue({ data: { items: [{ id: 'store-1', name: '上海店' }] } });

    const user = userEvent.setup();
    render(<CreateSalesPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '下一步：出口明细' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '下一步：出口明细' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '创建合同' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '创建合同' }));

    await waitFor(() => {
      expect(screen.getByText('请选择商品')).toBeInTheDocument();
      expect(screen.getByText('请选择门店')).toBeInTheDocument();
      expect(screen.getByText('数量必填')).toBeInTheDocument();
      expect(screen.getByText('成本必填')).toBeInTheDocument();
      expect(screen.getByText('售价必填')).toBeInTheDocument();
    });
  });
});
