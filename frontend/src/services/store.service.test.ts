/**
 * Input: 门店服务与API实例
 * Output: 门店服务接口单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { storeService } from './store.service';

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

describe('storeService', () => {
  it('getAll: 传递查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await storeService.getAll({ page: 2, pageSize: 10 });

    expect(api.get).toHaveBeenCalledWith('/stores', {
      params: { page: 2, pageSize: 10 },
    });
  });

  it('getById: 通过id获取详情', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await storeService.getById('st1');

    expect(api.get).toHaveBeenCalledWith('/stores/st1');
  });

  it('create: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { name: '新门店' };

    await storeService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/stores', payload);
  });

  it('update: 提交更新数据', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { contactName: '张三' };

    await storeService.update('st1', payload);

    expect(api.put).toHaveBeenCalledWith('/stores/st1', payload);
  });

  it('delete: 通过id删除', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await storeService.delete('st1');

    expect(api.delete).toHaveBeenCalledWith('/stores/st1');
  });
});
