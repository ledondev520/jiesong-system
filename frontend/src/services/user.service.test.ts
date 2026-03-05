/**
 * Input: 用户服务与API实例
 * Output: 用户服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { userService } from './user.service';

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

describe('userService', () => {
  it('getAll/getById: 调用正确查询接口', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await userService.getAll({ page: 1, pageSize: 20 });
    await userService.getById('u-1');

    expect(api.get).toHaveBeenCalledWith('/users', {
      params: { page: 1, pageSize: 20 },
    });
    expect(api.get).toHaveBeenCalledWith('/users/u-1');
  });

  it('create/update/delete: 调用正确端点', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    const payload = { name: '管理员' };
    await userService.create(payload);
    await userService.update('u-1', payload);
    await userService.delete('u-1');

    expect(api.post).toHaveBeenCalledWith('/users', payload);
    expect(api.put).toHaveBeenCalledWith('/users/u-1', payload);
    expect(api.delete).toHaveBeenCalledWith('/users/u-1');
  });
});
