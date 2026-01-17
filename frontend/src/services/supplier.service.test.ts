/**
 * Input: 供应商服务与API实例
 * Output: 供应商服务接口单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
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
  it('getAll: 传递查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await supplierService.getAll({ page: 1, pageSize: 20, query: '佛山' });

    expect(api.get).toHaveBeenCalledWith('/suppliers', {
      params: { page: 1, pageSize: 20, query: '佛山' },
    });
  });

  it('getById: 通过id获取详情', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await supplierService.getById('s1');

    expect(api.get).toHaveBeenCalledWith('/suppliers/s1');
  });

  it('create: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { name: '供应商A' };

    await supplierService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/suppliers', payload);
  });

  it('update: 提交更新数据', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { shortName: '供应商简称' };

    await supplierService.update('s1', payload);

    expect(api.put).toHaveBeenCalledWith('/suppliers/s1', payload);
  });

  it('delete: 通过id删除', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await supplierService.delete('s1');

    expect(api.delete).toHaveBeenCalledWith('/suppliers/s1');
  });
});
