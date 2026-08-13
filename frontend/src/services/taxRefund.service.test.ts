/**
 * Input: 退税服务与 API 实例
 * Output: 退税服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { taxRefundService } from './taxRefund.service';

const mockFetch = vi.fn();

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
  vi.stubGlobal('fetch', mockFetch);
});

describe('taxRefundService', () => {
  it('getAll 传递筛选参数', async () => {
    const params = { page: 1, pageSize: 20, keyword: 'TR', status: 'APPLIED' };

    await taxRefundService.getAll(params);

    expect(api.get).toHaveBeenCalledWith('/tax-refunds', { params });
  });

  it('getById 调用详情接口', async () => {
    await taxRefundService.getById('tr-1');

    expect(api.get).toHaveBeenCalledWith('/tax-refunds/tr-1');
  });

  it('create 调用新增接口', async () => {
    const payload = {
      refundNo: 'TR-20260307-01',
      status: 'DRAFT' as const,
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
      forexVerificationId: 'fv-1',
      declaredAmount: 128000,
      refundableAmount: 116500,
      refundedAmount: 0,
      appliedAt: '2026-03-07',
      refundedAt: null,
      note: '首批申报',
    };

    await taxRefundService.create(payload);

    expect(api.post).toHaveBeenCalledWith('/tax-refunds', payload);
  });

  it('update 调用更新接口', async () => {
    const payload = {
      refundNo: 'TR-20260307-01',
      status: 'REFUNDED' as const,
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
      forexVerificationId: 'fv-1',
      declaredAmount: 128000,
      refundableAmount: 116500,
      refundedAmount: 115000,
      appliedAt: '2026-03-07',
      refundedAt: '2026-03-20',
      note: '已到账',
    };

    await taxRefundService.update('tr-1', payload);

    expect(api.put).toHaveBeenCalledWith('/tax-refunds/tr-1', payload);
  });

  it('generateDrafts 调用自动草稿接口', async () => {
    const payload = {
      customsDeclarationId: 'cd-1',
      replaceExisting: true,
    };

    await taxRefundService.generateDrafts(payload);

    expect(api.post).toHaveBeenCalledWith('/tax-refunds/auto-drafts', payload);
  });

  it('getWorkbench 读取聚合退税工作台', async () => {
    const params = { page: 1, pageSize: 20, stage: 'PREPARATION' as const };
    await taxRefundService.getWorkbench(params);
    expect(api.get).toHaveBeenCalledWith('/tax-refunds/workbench', { params });
  });

  it('getInvoiceVerification 读取逐合同发票核验', async () => {
    await taxRefundService.getInvoiceVerification('sc-1');
    expect(api.get).toHaveBeenCalledWith('/tax-refunds/workbench/sc-1/invoice-verification');
  });
});
