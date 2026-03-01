/**
 * Input: 货柜服务与 API 实例
 * Output: 货柜服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { containerService } from './container.service';

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

describe('containerService', () => {
  describe('getAll/getById: 调用正确查询接口', () => {
    it('getAll: 传递查询参数', async () => {
      const params = { page: 2, pageSize: 50, keyword: 'test' };
      await containerService.getAll(params);
      
      expect(api.get).toHaveBeenCalledWith('/containers', { params });
    });

    it('getById: 传递正确 ID', async () => {
      const id = 'test-id';
      await containerService.getById(id);
      
      expect(api.get).toHaveBeenCalledWith(`/containers/${id}`);
    });
  });
});
