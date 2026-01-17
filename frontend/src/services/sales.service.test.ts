/**
 * Input: 销售服务价格计算函数
 * Output: 价格计算单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { salesService } from './sales.service';

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

describe('salesService api', () => {
  it('getAll: 传递查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await salesService.getAll({ page: 1, pageSize: 20, query: 'keyword' });

    expect(api.get).toHaveBeenCalledWith('/sales/contracts', {
      params: { page: 1, pageSize: 20, query: 'keyword' },
    });
  });

  it('getById: 使用id拼接路径', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await salesService.getById('123');

    expect(api.get).toHaveBeenCalledWith('/sales/contracts/123');
  });

  it('create: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { contractNo: 'EXP1' };

    await salesService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/sales/contracts', payload);
  });

  it('update: 使用id提交更新', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { note: 'updated' };

    await salesService.update('123', payload);

    expect(api.put).toHaveBeenCalledWith('/sales/contracts/123', payload);
  });

  it('delete: 使用id删除数据', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await salesService.delete('123');

    expect(api.delete).toHaveBeenCalledWith('/sales/contracts/123');
  });
});

describe('salesService.calculatePrice', () => {
  it('按公式计算并向上取整', () => {
    const price = salesService.calculatePrice(100, 6.8, 1.3);
    expect(price).toBe(Math.ceil((100 / (6.8 - 0.2)) * 1.3));
  });

  it('汇率过低时使用最小有效值', () => {
    const price = salesService.calculatePrice(100, 0.1, 1.3);
    expect(price).toBe(Math.ceil((100 / 0.1) * 1.3));
  });

  it('成本为0时结果为0', () => {
    const price = salesService.calculatePrice(0, 6.8, 1.3);
    expect(price).toBe(0);
  });
});
