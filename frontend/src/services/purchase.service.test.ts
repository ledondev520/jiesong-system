/**
 * Input: 采购服务与API实例
 * Output: 采购服务接口单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { purchaseService } from './purchase.service';

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

describe('purchaseService api', () => {
  it('getAll: 传递查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await purchaseService.getAll({ page: 1, pageSize: 20, query: '采购' });

    expect(api.get).toHaveBeenCalledWith('/purchases', {
      params: { page: 1, pageSize: 20, query: '采购' },
    });
  });

  it('getById: 通过id获取详情', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await purchaseService.getById('pc1');

    expect(api.get).toHaveBeenCalledWith('/purchases/pc1');
  });

  it('create: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { contractNo: 'CG25001' };

    await purchaseService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/purchases', payload);
  });

  it('update: 提交更新数据', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { note: 'updated' };

    await purchaseService.update('pc1', payload);

    expect(api.put).toHaveBeenCalledWith('/purchases/pc1', payload);
  });

  it('delete: 通过id删除', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await purchaseService.delete('pc1');

    expect(api.delete).toHaveBeenCalledWith('/purchases/pc1');
  });
});

describe('purchaseService.getNextContractNo', () => {
  it('获取下一个合同编号', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { contractNo: 'CG2500001' } });

    await purchaseService.getNextContractNo();

    expect(api.get).toHaveBeenCalledWith('/purchases/options/next-no');
  });
});

describe('purchaseService.getSuppliersByProducts', () => {
  it('根据商品ID获取供应商', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { supplierIds: ['s1', 's2'] } });

    await purchaseService.getSuppliersByProducts(['p1', 'p2']);

    expect(api.post).toHaveBeenCalledWith('/purchases/suppliers-by-products', { productIds: ['p1', 'p2'] });
  });
});

describe('purchaseService.parseQuote', () => {
  it('返回模拟解析结果', async () => {
    vi.useFakeTimers();
    const promise = purchaseService.parseQuote('报价文本');

    vi.runAllTimers();
    const result = await promise;

    expect(result).toEqual({
      success: true,
      data: [
        { productId: '1', quantity: 100, unitPrice: 45, unit: 'sqm', note: 'AI Parsed' },
        { productId: '2', quantity: 50, unitPrice: 120, unit: 'pcs', note: 'AI Parsed' },
      ],
    });

    vi.useRealTimers();
  });
});
