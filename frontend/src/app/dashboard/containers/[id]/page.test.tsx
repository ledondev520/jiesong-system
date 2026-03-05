/**
 * Input: 货柜详情页、container/product/store 服务、router、toast
 * Output: 货柜详情页交互逻辑测试结果
 * Pos: 前端详情页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';
import ContainerDetailPage from './page';

const mockGetById = vi.fn();
const mockProductGetAll = vi.fn();
const mockStoreGetAll = vi.fn();
const mockToastError = vi.fn();

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => {
      if (value && typeof (value as { then?: unknown }).then === 'function') {
        return { id: 'c-1' };
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

vi.mock('@/services/container.service', () => ({
  containerService: {
    getById: (...args: unknown[]) => mockGetById(...args),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
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

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('ContainerDetailPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockProductGetAll.mockReset();
    mockStoreGetAll.mockReset();
    mockToastError.mockReset();
  });

  /**
   * 职责：使用 Suspense 渲染依赖 use(params) 的详情页
   * 思路：统一包裹 fallback，确保 Promise params 能被 React 解析
   * @param id 货柜ID
   */
  const renderPage = (id = 'c-1') => {
    return render(
      <Suspense fallback={<div>页面加载中...</div>}>
        <ContainerDetailPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
  };

  it('加载成功后展示货柜号与装箱空态', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'c-1',
        contractNo: '25-001-LA',
        status: 'DRAFT',
        volume: 0,
        grossWeight: 0,
        netWeight: 0,
        totalBoxes: 0,
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });

    renderPage('c-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '25-001-LA' })).toBeInTheDocument();
      expect(screen.getByText('暂无装箱商品，点击"添加商品"开始装柜')).toBeInTheDocument();
    });
  });

  it('点击添加商品会打开弹窗', async () => {
    mockGetById.mockResolvedValue({
      data: {
        id: 'c-1',
        contractNo: '25-001-LA',
        status: 'DRAFT',
        packingItems: [],
        port: { name: 'LA' },
      },
    });
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });

    const user = userEvent.setup();
    renderPage('c-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /添加商品/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /添加商品/ }));
    expect(screen.getByText('添加商品到货柜')).toBeInTheDocument();
  });

  it('加载失败时提示错误', async () => {
    mockGetById.mockRejectedValue(new Error('load failed'));
    mockProductGetAll.mockResolvedValue({ data: { items: [] } });
    mockStoreGetAll.mockResolvedValue({ data: { items: [] } });

    renderPage('c-1');

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载数据失败');
    });
  });
});
