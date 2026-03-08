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
});
