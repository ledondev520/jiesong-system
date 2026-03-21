/**
 * Input: HSCode 查询参数
 * Output: HSCode 前端服务
 * Pos: 商品管理页智能匹配服务层
 */

import api from '@/lib/axios';
import type { ApiResponse, HsCodeRecord, PaginatedResponse } from '@/types';

export type HsCodeMatch = HsCodeRecord;

export interface BatchHsCodeMatchResult {
  productName: string;
  hsCode: string | null;
  match: HsCodeRecord | null;
  confidence: 'exact' | 'high' | 'low' | 'none';
}

export const hsCodeService = {
  list: async ({
    keyword = '',
    page = 1,
    pageSize = 20,
    fuzzy = false,
  }: {
    keyword?: string;
    page?: number;
    pageSize?: number;
    /** 启用相似度模糊搜索（有 keyword 时才生效） */
    fuzzy?: boolean;
  } = {}) => {
    return api.get<
      ApiResponse<PaginatedResponse<HsCodeRecord & { similarity?: number; fuzzy?: boolean }>>,
      ApiResponse<PaginatedResponse<HsCodeRecord & { similarity?: number; fuzzy?: boolean }>>
    >('/hs-codes', {
      params: { keyword, page, pageSize, fuzzy: fuzzy ? 'true' : undefined },
    });
  },

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
