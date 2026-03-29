/**
 * Input: 商品管理页面、productService、URL搜索参数、ProductDialog、toast
 * Output: 商品管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductsPage from './page';

const mockGetAll = vi.fn();
const mockToastError = vi.fn();
const mockSearchParamGet = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => '/dashboard/products',
}));

vi.mock('@/services/product.service', () => ({
  productService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('./components/ProductDialog', () => ({
  ProductDialog: ({
    open,
  }: {
    open: boolean;
  }) => (open ? <div>商品弹窗已打开</div> : null),
}));

vi.mock('./components/InventoryTab', () => ({
  InventoryTab: () => <div>库存状态 Tab</div>,
}));

describe('ProductsPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockToastError.mockReset();
    mockSearchParamGet.mockReset();
    mockSearchParamGet.mockImplementation((key: string) => (key === 'keyword' ? '' : null));
  });

  it('根据URL关键词初始化并拉取列表', async () => {
    mockSearchParamGet.mockImplementation((key: string) => (key === 'keyword' ? '苹果' : null));
    mockGetAll.mockResolvedValue({ data: { items: [] } });

    render(<ProductsPage />);

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        keyword: '苹果',
        lite: true,
      });
      expect(screen.getByDisplayValue('苹果')).toBeInTheDocument();
    });
  });

  it('修改搜索关键词会触发重新查询', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ProductsPage />);

    const input = screen.getByPlaceholderText('搜索商品...');
    await user.clear(input);
    await user.type(input, '香蕉');

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 100,
        keyword: '香蕉',
        lite: true,
      });
    });
  });

  it('点击新增商品会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ProductsPage />);

    await user.click(screen.getByRole('button', { name: /新增商品/ }));
    expect(screen.getByText('商品弹窗已打开')).toBeInTheDocument();
  });
});
