/**
 * Input: HSCode 服务与 API 实例
 * Output: HSCode 前端服务测试
 * Pos: 前端服务层测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { hsCodeService } from './hsCode.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hsCodeService', () => {
  it('search: 传递商品名称关键字', async () => {
    await hsCodeService.search('瓷砖');

    expect(api.get).toHaveBeenCalledWith('/hs-codes/search', {
      params: { keyword: '瓷砖' },
    });
  });

  it('getByCode: 传递编码路径参数', async () => {
    await hsCodeService.getByCode('69072190');

    expect(api.get).toHaveBeenCalledWith('/hs-codes/69072190');
  });

  it('list: 空关键字时请求分页列表', async () => {
    await hsCodeService.list({ page: 2, pageSize: 50 });

    expect(api.get).toHaveBeenCalledWith('/hs-codes', {
      params: { keyword: undefined, code: undefined, page: 2, pageSize: 50 },
    });
  });

  it('update: 提交税率与证据字段到编码更新路径', async () => {
    await hsCodeService.update('6907219000', {
      refundRate: 0,
      vatRate: 13,
      effectiveDate: '2026-01-01',
      sourceUrl: 'https://www.chinatax.gov.cn/example',
      note: '人工复核',
    });

    expect(api.put).toHaveBeenCalledWith('/hs-codes/6907219000', {
      refundRate: 0,
      vatRate: 13,
      effectiveDate: '2026-01-01',
      sourceUrl: 'https://www.chinatax.gov.cn/example',
      note: '人工复核',
    });
  });
});
