/**
 * Input: 全局搜索服务、API实例
 * Output: 搜索聚合链路单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { searchDashboard } from './dashboardSearch.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockPaginatedResponse = <T,>(items: T[]) => ({
  code: 200,
  message: 'ok',
  data: {
    items,
    pagination: {
      total: items.length,
      page: 1,
      pageSize: items.length || 1,
      totalPages: items.length > 0 ? 1 : 0,
    },
  },
});

describe('searchDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('首批商品和供应商结果已足够时，不再触发合同类查询', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === '/products') {
        return Promise.resolve(mockPaginatedResponse([
          { id: 'p-1', customsName: '瓷砖 A', specification: '600x600' },
          { id: 'p-2', customsName: '瓷砖 B', specification: '800x800' },
        ]));
      }

      if (path === '/suppliers') {
        return Promise.resolve(mockPaginatedResponse([
          { id: 's-1', name: '佛山供应商', shortName: '佛山' },
          { id: 's-2', name: '潮州供应商', shortName: '潮州' },
        ]));
      }

      return Promise.resolve(mockPaginatedResponse([]));
    });

    const results = await searchDashboard('瓷砖', { limit: 4 });

    expect(api.get).toHaveBeenNthCalledWith(1, '/products', {
      params: { keyword: '瓷砖', pageSize: 4 },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/suppliers', {
      params: { keyword: '瓷砖', pageSize: 4 },
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.type)).toEqual([
      'product',
      'product',
      'supplier',
      'supplier',
    ]);
  });

  it('首批结果不足时，补充第二批合同类结果', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === '/products') {
        return Promise.resolve(mockPaginatedResponse([
          { id: 'p-1', customsName: '瓷砖 A', unit: '箱' },
        ]));
      }

      if (path === '/suppliers') {
        return Promise.resolve(mockPaginatedResponse([]));
      }

      if (path === '/containers') {
        return Promise.resolve(mockPaginatedResponse([
          { id: 'c-1', contractNo: 'CT-001', status: 'IN_TRANSIT' },
        ]));
      }

      if (path === '/purchases') {
        return Promise.resolve(mockPaginatedResponse([
          { id: 'pc-1', contractNo: 'CG-001', supplier: { name: '佛山供应商' } },
        ]));
      }

      if (path === '/sales') {
        return Promise.resolve(mockPaginatedResponse([
          { id: 'sc-1', contractNo: 'XS-001', totalAmount: 16800 },
        ]));
      }

      return Promise.resolve(mockPaginatedResponse([]));
    });

    const results = await searchDashboard('瓷砖', { limit: 4 });

    expect(api.get).toHaveBeenNthCalledWith(3, '/containers', {
      params: { keyword: '瓷砖', pageSize: 3 },
    });
    expect(api.get).toHaveBeenNthCalledWith(4, '/purchases', {
      params: { keyword: '瓷砖', pageSize: 3 },
    });
    expect(api.get).toHaveBeenNthCalledWith(5, '/sales', {
      params: { keyword: '瓷砖', pageSize: 3 },
    });
    expect(results.map((result) => result.type)).toEqual([
      'product',
      'container',
      'purchase',
      'sales',
    ]);
  });
});
