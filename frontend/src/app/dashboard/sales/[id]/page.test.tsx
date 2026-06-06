/**
 * Input: 销售合同详情页、sales/product/store/inventory 服务、router、toast
 * Output: 销售合同详情页交互逻辑测试结果
 * Pos: 前端详情页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import SalesDetailPage from './page';

const mockGetById = vi.fn();
const mockProductGetAll = vi.fn();
const mockStoreGetAll = vi.fn();
const mockInventoryGetAll = vi.fn();
const mockApiGet = vi.fn();
const mockApiDelete = vi.fn();
const mockToastError = vi.fn();
const mockExportPdf = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 's-1' };
      }
      return actual.use(value as never);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    update: vi.fn(),
    addPackingItem: vi.fn(),
    updatePackingItem: vi.fn(),
    removePackingItem: vi.fn(),
    exportPdf: (...args: unknown[]) => mockExportPdf(...args),
  },
}));

vi.mock('@/services/product.service', () => ({
  productService: {
    getAll: (...args: unknown[]) => mockProductGetAll(...args),
  },
}));

vi.mock('@/services/store.service', () => ({
  storeService: {
    getAll: (...args: unknown[]) => mockStoreGetAll(...args),
  },
}));

vi.mock('@/services/inventory.service', () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => mockInventoryGetAll(...args),
  },
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/components/sales/ContractInfoEditor', () => ({
  ContractInfoEditor: () => <div>合同信息编辑区</div>,
}));

vi.mock('@/components/container/Container3DView', () => ({
  default: () => <div>3D容器视图</div>,
}));

describe('SalesDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockProductGetAll.mockReset();
    mockStoreGetAll.mockReset();
    mockInventoryGetAll.mockReset();
    mockApiGet.mockReset();
    mockApiDelete.mockReset();
    mockToastError.mockReset();
    mockExportPdf.mockReset();
    mockApiGet.mockResolvedValue({ data: [] });
  });

  /**
   * 职责：使用 Suspense 渲染依赖 use(params) 的详情页
   * 思路：统一包裹 fallback，确保 Promise params 能被 React 解析
   * @param id 合同ID
   */
  const renderPage = (id = 's-1') => {
    return render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <SalesDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  };

  it('加载成功后展示合同号与空装箱态', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP2500001',
        status: 'DRAFT',
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    renderPage('s-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'EXP2500001' })).toBeInTheDocument();
      expect(screen.getByText('暂无装箱商品，点击"添加商品"开始装柜')).toBeInTheDocument();
      expect(screen.getByText('暂无附件，点击「上传附件」归档出货源文件')).toBeInTheDocument();
    });
    expect(mockApiGet).toHaveBeenCalledWith('/contracts/s-1/files', { params: { contractType: 'SALES' } });
    expect(mockProductGetAll).not.toHaveBeenCalled();
    expect(mockStoreGetAll).not.toHaveBeenCalled();
    expect(mockInventoryGetAll).not.toHaveBeenCalled();
  });

  it('点击添加商品会打开明细弹窗', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP2500001',
        status: 'DRAFT',
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });

    const user = userEvent.setup();
    renderPage('s-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /添加商品/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /添加商品/ }));
    expect(screen.getByText('添加商品到货柜')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockProductGetAll).toHaveBeenCalled();
      expect(mockStoreGetAll).toHaveBeenCalled();
      expect(mockInventoryGetAll).toHaveBeenCalled();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });

    renderPage('s-1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载数据失败');
    });
  });

  it('导出 PDF 按钮已移除，页面只保留保存为图片', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 's-1',
        contractNo: 'EXP2500001',
        status: 'DRAFT',
        totalBoxes: 0,
        volume: 0,
        grossWeight: 0,
        totalAmount: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });
    mockInventoryGetAll.mockResolvedValue({ data: { items: [] } });

    renderPage('s-1');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /导出合同 PDF/ })).not.toBeInTheDocument();
    });
  });
});
