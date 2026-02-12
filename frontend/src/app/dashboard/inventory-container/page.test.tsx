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
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/inventory.service', () => ({
  inventoryService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe('InventoryPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockUpdateStatus.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('加载后展示空态', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const { container } = render(<InventoryPage />);

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

  it('可更新库存状态为已出库', async () => {
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

    // 1. 执行状态更新
    await user.click(screen.getByText('设为: 已出库'));

    // 2. 验证服务调用与成功反馈
    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith('inv-1', 'OUTBOUND');
      expect(mockToastSuccess).toHaveBeenCalledWith('状态已更新');
    });
  });
});

