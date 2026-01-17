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
    const payload = { amount: 1000 };

    await financeService.createPayment(payload);

    expect(api.post).toHaveBeenCalledWith('/finance/payments', payload);
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
      totalPayable: 0,
      totalReceivable: 0,
      monthlyCashIn: 0,
      monthlyCashOut: 0,
    });
  });
});
