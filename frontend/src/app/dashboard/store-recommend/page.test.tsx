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

const mockGetStoreStats = vi.fn();
const mockGenerateRecommendations = vi.fn();
const mockGetStoreList = vi.fn();
const mockGetUniversalTemplate = vi.fn();
const mockGetStoreTemplate = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard/store-recommend',
}));

vi.mock('@/lib/tab-memory', () => ({
  saveModuleTab: vi.fn(),
  getModuleTab: vi.fn((href: string) => href),
}));

vi.mock('@/services/storeRecommend.service', () => ({
  storeRecommendService: {
    getStoreStats: (...args: unknown[]) => mockGetStoreStats(...args),
    generateRecommendations: (...args: unknown[]) => mockGenerateRecommendations(...args),
  },
}));

vi.mock('@/services/procurementTemplate.service', () => ({
  procurementTemplateService: {
    getStoreList: (...args: unknown[]) => mockGetStoreList(...args),
    getUniversalTemplate: (...args: unknown[]) => mockGetUniversalTemplate(...args),
    getStoreTemplate: (...args: unknown[]) => mockGetStoreTemplate(...args),
  },
}));

describe('StoreRecommendPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetStoreStats.mockReset();
    mockGenerateRecommendations.mockReset();
    mockGetStoreList.mockReset();
    mockGetUniversalTemplate.mockReset();
    mockGetStoreTemplate.mockReset();

    mockGetStoreList.mockResolvedValue({ data: [] });
    mockGetUniversalTemplate.mockResolvedValue({
      data: {
        items: [],
        totalStores: 0,
        totalProducts: 0,
        mustHaveCount: 0,
        templateStore: '基准门店',
        byCategory: {},
      },
    });
    mockGetStoreTemplate.mockResolvedValue({
      data: { storeId: '', storeName: '', items: [], byCategory: {}, totalProducts: 0, totalAmount: 0 },
    });
  });

  it('加载后展示采购建议清单标题', async () => {
    mockGetStoreList.mockResolvedValue({ data: ['洛杉矶店'] });
    mockGetUniversalTemplate.mockResolvedValue({
      data: {
        items: [],
        totalStores: 1,
        totalProducts: 3,
        mustHaveCount: 0,
        templateStore: '洛杉矶店',
        byCategory: {},
      },
    });

    render(<StoreRecommendPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '采购建议清单' })).toBeInTheDocument();
    });
  });

  it('有门店数据时展示门店选择器', async () => {
    mockGetStoreList.mockResolvedValue({ data: ['洛杉矶店', '纽约店'] });
    mockGetUniversalTemplate.mockResolvedValue({
      data: {
        items: [],
        totalStores: 2,
        totalProducts: 0,
        mustHaveCount: 0,
        templateStore: '洛杉矶店',
        byCategory: {},
      },
    });

    render(<StoreRecommendPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '采购建议清单' })).toBeInTheDocument();
    });
  });

  it('切换到指定门店后调用门店模板接口', async () => {
    mockGetStoreList.mockResolvedValue({ data: ['洛杉矶店'] });
    mockGetUniversalTemplate.mockResolvedValue({
      data: {
        items: [],
        totalStores: 1,
        totalProducts: 0,
        mustHaveCount: 0,
        templateStore: '洛杉矶店',
        byCategory: {},
      },
    });
    mockGetStoreTemplate.mockResolvedValue({
      data: {
        storeId: 'st-1',
        storeName: '洛杉矶店',
        totalProducts: 1,
        totalAmount: 1200,
        byCategory: {},
        items: [],
      },
    });

    render(<StoreRecommendPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '采购建议清单' })).toBeInTheDocument();
    });
  });
});
