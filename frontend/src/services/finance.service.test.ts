/**
 * Input: 财务服务与API实例
 * Output: 财务服务接口单元测试
 * Pos: 前端业务服务测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { financeService } from './finance.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('financeService', () => {
  it('getPayments: 传递查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await financeService.getPayments({ page: 1, pageSize: 20, type: 'PAYABLE' });

    expect(api.get).toHaveBeenCalledWith('/finance/payments', {
      params: { page: 1, pageSize: 20, type: 'PAYABLE' },
    });
  });

  it('createPayment: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = {
      type: 'PAYABLE',
      purchaseContractId: 'ct-1',
      amount: 1000,
      currency: 'CNY',
      paymentMethod: 'BANK_TRANSFER',
      paymentDate: '2026-03-01T08:00:00.000Z',
    };

    await financeService.createPayment(payload);

    expect(api.post).toHaveBeenCalledWith(
      '/finance/payments',
      payload,
      {
        headers: {
          'X-Idempotency-Key': expect.any(String),
        },
      },
    );
  });

  it('createPayment: 并发重复请求复用幂等缓存', async () => {
    const payload = {
      type: 'RECEIVABLE',
      salesContractId: 'ct-2',
      amount: 500,
      currency: 'USD',
      paymentMethod: 'WECHAT',
      paymentDate: '2026-03-01T09:00:00.000Z',
      note: 'idempotent-test',
    };
    const mockResponse = { code: 200, data: { id: 'p-1' } };
    let resolvePost: (value: typeof mockResponse) => void;
    const pending = new Promise<typeof mockResponse>((resolve) => {
      resolvePost = resolve;
    });
    (api.post as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pending);

    const first = financeService.createPayment(payload);
    const second = financeService.createPayment(payload);
    expect(api.post).toHaveBeenCalledTimes(1);

    resolvePost!(mockResponse);
    const result = await Promise.all([first, second]);

    expect(result).toEqual([mockResponse, mockResponse]);
  });

  it('getStats: 调用API获取统计数据', async () => {
    const mockData = {
      payable: { total: 125000, paid: 50000, unpaid: 75000 },
      receivable: { total: 85000, received: 30000, unreceived: 55000 },
    };
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockData });

    const stats = await financeService.getStats();

    expect(api.get).toHaveBeenCalledWith('/finance/stats');
    expect(stats).toEqual(mockData);
  });

  it('getStats: API错误时返回默认值', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

    const stats = await financeService.getStats();

    expect(stats).toEqual({
      payable: {
        total: 0,
        paid: 0,
        unpaid: 0,
      },
      receivable: {
        total: 0,
        received: 0,
        unreceived: 0,
      },
    });
  });
});
