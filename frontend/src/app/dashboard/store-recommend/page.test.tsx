/**
 * Input: 门店采购建议页面、API请求模块
 * Output: 门店采购建议页交互逻辑测试结果
 * Pos: 前端业务分析页面交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoreRecommendPage from './page';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

describe('StoreRecommendPage 交互逻辑', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it('加载后展示建议清单概要数据', async () => {
    mockApiGet.mockResolvedValue({
      data: [
        {
          storeId: 'st-1',
          storeName: '洛杉矶店',
          totalAmount: 12000,
          productCount: 20,
          categories: [{ name: '餐具用品', amount: 12000, count: 20 }],
        },
      ],
    });
    mockApiPost.mockResolvedValue({
      data: {
        referenceStoreCount: 1,
        totalProducts: 3,
        totalEstimatedCost: 5000,
        recommendations: [
          {
            productId: 'p-1',
            productName: '陶瓷盘',
            category: '餐具用品',
            subCategory: '盘类',
            frequency: 80,
            suggestedQuantity: 50,
            avgUnitPrice: 10,
            estimatedCost: 500,
            priority: '强烈建议',
          },
        ],
        byCategory: {
          餐具用品: [
            {
              productId: 'p-1',
              productName: '陶瓷盘',
              category: '餐具用品',
              subCategory: '盘类',
              frequency: 80,
              suggestedQuantity: 50,
              avgUnitPrice: 10,
              estimatedCost: 500,
              priority: '强烈建议',
            },
          ],
        },
      },
    });

    render(<StoreRecommendPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '门店采购建议' })).toBeInTheDocument();
      expect(screen.getByText('建议采购')).toBeInTheDocument();
      expect(screen.getByText('必备商品清单')).toBeInTheDocument();
    });
  });

  it('切换到门店采购统计标签后展示门店明细', async () => {
    mockApiGet.mockResolvedValue({
      data: [
        {
          storeId: 'st-1',
          storeName: '洛杉矶店',
          totalAmount: 12000,
          productCount: 20,
          categories: [{ name: '餐具用品', amount: 12000, count: 20 }],
        },
      ],
    });
    mockApiPost.mockResolvedValue({
      data: {
        referenceStoreCount: 1,
        totalProducts: 3,
        totalEstimatedCost: 5000,
        recommendations: [],
        byCategory: {},
      },
    });

    const user = userEvent.setup();
    render(<StoreRecommendPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '📊 门店采购统计' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: '📊 门店采购统计' }));

    await waitFor(() => {
      expect(screen.getByText('门店采购明细')).toBeInTheDocument();
      expect(screen.getByText('洛杉矶店')).toBeInTheDocument();
    });
  });
});

