/**
 * Input: 商品服务与API实例
 * Output: 商品服务接口单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { productService } from './product.service';

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

describe('productService', () => {
  it('getAll: 传递查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await productService.getAll({ page: 1, pageSize: 20, query: 'tile' });

    expect(api.get).toHaveBeenCalledWith('/products', {
      params: { page: 1, pageSize: 20, query: 'tile' },
    });
  });

  it('getById: 通过id获取详情', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await productService.getById('p1');

    expect(api.get).toHaveBeenCalledWith('/products/p1');
  });

  it('create: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { customsName: '瓷砖' };

    await productService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/products', payload);
  });

  it('update: 提交更新数据', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { specification: '800*800' };

    await productService.update('p1', payload);

    expect(api.put).toHaveBeenCalledWith('/products/p1', payload);
  });

  it('delete: 通过id删除', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await productService.delete('p1');

    expect(api.delete).toHaveBeenCalledWith('/products/p1');
  });
});
