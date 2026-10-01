/**
 * Input: 销售服务请求与价格计算函数
 * Output: 出口合同、船司核对、单柜财务汇总及价格计算测试
 * Pos: 前端业务服务 Module 测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { SalesStatus } from '@/types';
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

    await salesService.getAll({ page: 1, pageSize: 20, keyword: 'keyword' });

    expect(api.get).toHaveBeenCalledWith('/sales', {
      params: { page: 1, pageSize: 20, keyword: 'keyword' },
    });
  });

  it('getAll: 保留经营钻取的发运状态、上海日期及页码', async () => {
    const params = { page: 6, pageSize: 20, shipped: true, shippedFrom: '2026-09-01', shippedTo: '2026-09-30', status: SalesStatus.SHIPPED, keyword: '目标港口' };
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    await salesService.getAll(params);
    expect(api.get).toHaveBeenCalledWith('/sales', { params });
  });

  it('getById: 使用id拼接路径', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await salesService.getById('123');

    expect(api.get).toHaveBeenCalledWith('/sales/123');
  });

  it('create: 提交新增数据', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { contractNo: 'EXP1' };

    await salesService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/sales', payload);
  });

  it('update: 使用id提交更新', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const payload = { note: 'updated' };

    await salesService.update('123', payload);

    expect(api.put).toHaveBeenCalledWith('/sales/123', payload);
  });

  it('delete: 使用id删除数据', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await salesService.delete('123');

    expect(api.delete).toHaveBeenCalledWith('/sales/123');
  });

  it('getAvailablePurchaseItems: 查询当前货柜可用的采购完工来源', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await salesService.getAvailablePurchaseItems('sc-1');

    expect(api.get).toHaveBeenCalledWith('/sales/sc-1/available-purchase-items');
  });

  it('importPurchaseItems: 按箱数批量导入采购明细', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    const items = [{ purchaseItemId: 'pi-1', boxes: 4 }];

    await salesService.importPurchaseItems('sc-1', items);

    expect(api.post).toHaveBeenCalledWith('/sales/sc-1/import-purchase-items', { items });
  });

  it('listPackingListChecks: 读取当前出口合同的核对历史', async () => {
    await salesService.listPackingListChecks('sc-1', 10);

    expect(api.get).toHaveBeenCalledWith('/sales/sc-1/packing-list-checks', {
      params: { limit: 10 },
    });
  });

  it('reviewPackingListCheck: 保存人工通过结论与说明', async () => {
    await salesService.reviewPackingListCheck('sc-1', 'check-1', 'APPROVED', '已与船司复核');

    expect(api.put).toHaveBeenCalledWith('/sales/sc-1/packing-list-checks/check-1/review', {
      decision: 'APPROVED',
      note: '已与船司复核',
    });
  });

  it('getTaxRefundPreparation: 读取专项单当前材料准备度', async () => {
    await salesService.getTaxRefundPreparation('sc-1');

    expect(api.get).toHaveBeenCalledWith('/sales/sc-1/tax-refund-preparation');
  });

  it('getFinanceSummary: 读取单柜收入、成本、退税与现金流统一口径', async () => {
    await salesService.getFinanceSummary('sc-1');

    expect(api.get).toHaveBeenCalledWith('/sales/sc-1/finance-summary');
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
