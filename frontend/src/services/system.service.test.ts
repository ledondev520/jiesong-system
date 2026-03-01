/**
 * Input: system.service 与 API 实例
 * Output: 系统服务层接口单元测试
 * Pos: 前端服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import {
  getSystemPorts,
  createSystemPort,
  updateSystemPort,
  deleteSystemPort,
  getSystemCategories,
  createSystemCategory,
  updateSystemCategory,
  deleteSystemCategory,
} from './system.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/auth-token', () => ({
  getAuthToken: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('system.service', () => {
  it('getSystemPorts: 传递分页与筛选参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await getSystemPorts({ page: 2, pageSize: 20, keyword: 'LA' });

    expect(api.get).toHaveBeenCalledWith('/system/ports', {
      params: { page: 2, pageSize: 20, keyword: 'LA' },
    });
  });

  it('createSystemPort/updateSystemPort/deleteSystemPort: 调用正确端点', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await createSystemPort({ name: 'Los Angeles', code: 'LA' });
    await updateSystemPort('p1', { name: 'Oakland' });
    await deleteSystemPort('p1');

    expect(api.post).toHaveBeenCalledWith('/system/ports', { name: 'Los Angeles', code: 'LA' });
    expect(api.put).toHaveBeenCalledWith('/system/ports/p1', { name: 'Oakland' });
    expect(api.delete).toHaveBeenCalledWith('/system/ports/p1');
  });

  it('getSystemCategories: 传递分页与关键词参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await getSystemCategories({ page: 1, pageSize: 50, keyword: '陶瓷' });

    expect(api.get).toHaveBeenCalledWith('/system/categories', {
      params: { page: 1, pageSize: 50, keyword: '陶瓷' },
    });
  });

  it('createSystemCategory/updateSystemCategory/deleteSystemCategory: 调用正确端点', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await createSystemCategory({ name: '大类', parentId: null });
    await updateSystemCategory('c1', { name: '新分类' });
    await deleteSystemCategory('c1');

    expect(api.post).toHaveBeenCalledWith('/system/categories', { name: '大类', parentId: null });
    expect(api.put).toHaveBeenCalledWith('/system/categories/c1', { name: '新分类' });
    expect(api.delete).toHaveBeenCalledWith('/system/categories/c1');
  });
});

