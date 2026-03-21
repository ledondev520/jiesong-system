/**
 * Input: 库存状态页面、inventoryService、toast
 * Output: 库存状态页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPage from './page';

const mockGetAll = vi.fn();
const mockUpdateStatus = vi.fn();
const mockBatchUpdateStatus = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/inventory-container',
}));

vi.mock('@/services/inventory.service', () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    batchUpdateStatus: (...args: unknown[]) => mockBatchUpdateStatus(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('InventoryPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockUpdateStatus.mockReset();
    mockBatchUpdateStatus.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('加载后展示空态', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<InventoryPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '库存状态' })).toBeInTheDocument();
      expect(screen.getByText('暂无库存记录')).toBeInTheDocument();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<InventoryPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载库存失败');
    });
  });

  it('可按状态机规则更新库存状态', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'inv-1',
            status: 'PRODUCING',
            quantity: 100,
            product: { customsName: '测试商品', unit: '箱' },
            purchaseItem: { purchaseContract: { contractNo: 'CG2500001' } },
          },
        ],
      },
    });
    mockUpdateStatus.mockResolvedValue({});

    const user = userEvent.setup();
    const { container } = render(<InventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('测试商品')).toBeInTheDocument();
    });

    // 0. 打开状态菜单
    const trigger = container.querySelector('[data-slot="dropdown-menu-trigger"]');
    expect(trigger).toBeTruthy();
    if (!trigger) return;
    await user.click(trigger);

    // 1. 执行状态更新（PRODUCING 仅允许到 PACKING）
    await user.click(screen.getByText('设为: 包装中'));

    // 2. 验证服务调用与成功反馈
    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith('inv-1', 'PACKING');
      expect(mockToastSuccess).toHaveBeenCalledWith('状态已更新');
    });
  });

  it('输入关键词时会触发后端关键词查询', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<InventoryPage />);

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        keyword: undefined,
      });
    });

    await user.type(screen.getByPlaceholderText('搜索商品/采购合同...'), '瓷砖');

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 100,
        keyword: '瓷砖',
      });
    });
  });

  it('可批量更新库存状态', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'inv-1',
            status: 'INBOUND',
            quantity: 100,
            product: { customsName: '测试商品A', unit: '箱' },
            purchaseItem: { purchaseContract: { contractNo: 'CG2500001' } },
          },
          {
            id: 'inv-2',
            status: 'INBOUND',
            quantity: 80,
            product: { customsName: '测试商品B', unit: '箱' },
            purchaseItem: { purchaseContract: { contractNo: 'CG2500002' } },
          },
        ],
      },
    });
    mockBatchUpdateStatus.mockResolvedValue({
      data: { success: 2, failed: 0, errors: [] },
    });

    const user = userEvent.setup();
    render(<InventoryPage />);

    await waitFor(() => {
      expect(screen.getByText('测试商品A')).toBeInTheDocument();
    });

    // 0. 勾选两条库存记录
    await user.click(screen.getByRole('checkbox', { name: '选择库存 测试商品A' }));
    await user.click(screen.getByRole('checkbox', { name: '选择库存 测试商品B' }));

    // 1. 执行批量状态更新
    await user.click(screen.getByRole('button', { name: '批量设为已出库' }));

    // 2. 验证调用参数与结果提示
    await waitFor(() => {
      expect(mockBatchUpdateStatus).toHaveBeenCalledWith(['inv-1', 'inv-2'], 'OUTBOUND');
      expect(mockToastSuccess).toHaveBeenCalledWith('批量更新完成：成功 2 条');
    });
  });
});
