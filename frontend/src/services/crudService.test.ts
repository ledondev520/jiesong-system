/**
 * Input: createCrudService 与 axios 实例
 * Output: 通用 CRUD 工厂测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { createCrudService } from './crudService';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('createCrudService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('会标准化 basePath 并透传 getAll 查询参数', async () => {
    const service = createCrudService<{ id: string }, { name: string }, { name: string }, { page: number }>('users');
    await service.getAll?.({ page: 2 });

    expect(api.get).toHaveBeenCalledWith('/users', { params: { page: 2 } });
  });

  it('会生成 getById/create/update/delete 标准请求', async () => {
    const service = createCrudService<{ id: string; name: string }, { name: string }, { name: string }>('/products');

    await service.getById?.('1');
    await service.create?.({ name: 'A' });
    await service.update?.('1', { name: 'B' });
    await service.delete?.('1');

    expect(api.get).toHaveBeenCalledWith('/products/1');
    expect(api.post).toHaveBeenCalledWith('/products', { name: 'A' });
    expect(api.put).toHaveBeenCalledWith('/products/1', { name: 'B' });
    expect(api.delete).toHaveBeenCalledWith('/products/1');
  });

  it('支持按需关闭方法', () => {
    const service = createCrudService<{ id: string }>('/stores', {
      methods: {
        create: false,
        delete: false,
      },
    });

    expect(typeof service.getAll).toBe('function');
    expect(typeof service.getById).toBe('function');
    expect(service.create).toBeUndefined();
    expect(service.delete).toBeUndefined();
  });
});
