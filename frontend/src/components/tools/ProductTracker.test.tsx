/**
 * Input: ProductTracker组件、查询API、router、toast
 * Output: 商品追踪组件交互测试结果
 * Pos: 工作台工具组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductTracker } from './ProductTracker';

const mockPush = vi.fn();
const mockTrackProduct = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    trackProduct: (...args: unknown[]) => mockTrackProduct(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('ProductTracker', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockTrackProduct.mockReset();
    mockToastError.mockReset();
  });

  it('商品名为空时提示错误', async () => {
    const user = userEvent.setup();
    render(<ProductTracker />);

    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(mockToastError).toHaveBeenCalledWith('请输入商品名称');
  });

  it('查询成功后点击结果会跳转详情', async () => {
    mockTrackProduct.mockResolvedValue({
      data: [
        {
          salesContractId: 'sales-1',
          contractNo: 'EXP260001',
          portName: 'LA',
          status: 'SHIPPED',
          eta: '2026-02-20',
          storeName: '洛杉矶店',
          productName: '不锈钢门',
          quantity: 20,
        },
      ],
    });

    const user = userEvent.setup();
    render(<ProductTracker />);

    await user.type(screen.getByPlaceholderText('商品名称（如：不锈钢门）*'), '不锈钢门');
    await user.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(screen.getByText('EXP260001')).toBeInTheDocument();
    });

    await user.click(screen.getByText('EXP260001'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/sales-1');
  });

  it('在商品输入框按回车可触发查询', async () => {
    mockTrackProduct.mockResolvedValue({ data: [] });

    const user = userEvent.setup();
    render(<ProductTracker />);

    const productInput = screen.getByPlaceholderText('商品名称（如：不锈钢门）*');
    await user.type(productInput, '不锈钢门{Enter}');

    await waitFor(() => {
      expect(mockTrackProduct).toHaveBeenCalledWith({
        product: '不锈钢门',
        store: undefined,
      });
    });
  });

  it('查询失败时提示错误并显示空结果态', async () => {
    mockTrackProduct.mockRejectedValue(new Error('query failed'));

    const user = userEvent.setup();
    render(<ProductTracker />);

    await user.type(screen.getByPlaceholderText('商品名称（如：不锈钢门）*'), '不锈钢门');
    await user.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('查询失败，请稍后重试');
    });
    expect(screen.getByText('未找到匹配的货柜记录')).toBeInTheDocument();
  });
});
