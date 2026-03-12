/**
 * Input: HSCode 查询参数
 * Output: HSCode 前端服务
 * Pos: 商品管理页智能匹配服务层
 */

import api from '@/lib/axios';
import type { ApiResponse, HsCodeRecord } from '@/types';

export type HsCodeMatch = HsCodeRecord;

export interface BatchHsCodeMatchResult {
  productName: string;
  hsCode: string | null;
  match: HsCodeRecord | null;
  confidence: 'exact' | 'high' | 'low' | 'none';
}

export const hsCodeService = {
  search: async (keyword: string) => {
    return api.get<ApiResponse<HsCodeRecord[]>, ApiResponse<HsCodeRecord[]>>('/hs-codes/search', {
      params: { keyword },
    });
  },

  searchByProductName: async (keyword: string) => {
    return hsCodeService.search(keyword);
  },

  getByCode: async (code: string) => {
    return api.get<ApiResponse<HsCodeRecord>, ApiResponse<HsCodeRecord>>(`/hs-codes/${code}`);
  },

  searchByHsCode: async (code: string) => {
    return hsCodeService.getByCode(code);
  },

  batchMatch: async (productNames: string[]) => {
    return api.post<ApiResponse<BatchHsCodeMatchResult[]>, ApiResponse<BatchHsCodeMatchResult[]>>('/hs-codes/batch-match', {
      productNames,
    });
  },
};
