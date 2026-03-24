/**
 * Input: 采购合同页面、purchaseService、router、URL参数、toast
 * Output: 采购合同页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractsPage from './page';

const mockPush = vi.fn();
const mockSearchParamGet = vi.fn();
const mockGetAll = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => '/dashboard/contracts',
}));

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    getById: vi.fn(),
  },
}));

vi.mock('@/services/contractDoc.service', () => ({
  contractDocService: {
    generateFromPurchase: vi.fn(),
    downloadDocument: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('ContractsPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSearchParamGet.mockReset();
    mockGetAll.mockReset();
    mockToastError.mockReset();
    mockSearchParamGet.mockReturnValue('');
  });

  it('加载后展示采购模块概览与空态文案', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<ContractsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '采购合同' })).toBeInTheDocument();
      expect(screen.getByText('采购执行概览')).toBeInTheDocument();
      expect(screen.getByText('合作店铺')).toBeInTheDocument();
      expect(screen.getAllByText('暂无采购合同').length).toBeGreaterThan(0);
    });
  });

  it('点击新增采购按钮会跳转创建页', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ContractsPage />);

    await user.click(screen.getAllByRole('button', { name: /新增采购/ })[0]);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/create');
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<ContractsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载采购合同失败');
    });
  });

  it('提供移动端筛选入口与合同卡片动作', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: 'purchase-1',
            contractNo: 'CG2500001',
            status: 'SIGNED',
            totalAmount: 12800,
            paidAmount: 6400,
            signedAt: '2026-03-24T00:00:00.000Z',
            storeName: '上海店',
            supplier: { name: '佛山陶瓷有限公司', hasQualityIssue: false },
            items: [
              {
                id: 'item-1',
                product: { customsName: '瓷砖' },
              },
            ],
          },
        ],
      },
    });
    render(<ContractsPage />);

    expect(await screen.findByRole('button', { name: '筛选与搜索' })).toBeInTheDocument();
    expect(screen.getAllByText('CG2500001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('上海店').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '查看 CG2500001 详情' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '为 CG2500001 生成购销合同' }).length).toBeGreaterThan(0);
  });
});
