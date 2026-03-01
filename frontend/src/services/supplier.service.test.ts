/**
 * Input: 供应商服务与 API 实例
 * Output: 供应商服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { supplierService } from './supplier.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('supplierService', () => {
  describe('getAll: 传递查询参数', () => {
    it('传递分页参数', async () => {
      const params = { page: 2, pageSize: 50 };
      await supplierService.getAll(params);
      
      expect(api.get).toHaveBeenCalledWith('/suppliers', { params });
    });

    it('传递关键词搜索', async () => {
      const params = { keyword: 'test' };
      await supplierService.getAll(params);
      
      expect(api.get).toHaveBeenCalledWith('/suppliers', { params });
    });
  });
});
