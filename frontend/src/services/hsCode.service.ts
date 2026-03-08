/**
 * Input: HSCode 查询参数
 * Output: HSCode 前端服务
 * Pos: 商品管理页智能匹配服务层
 */

import api from '@/lib/axios';
import type { ApiResponse, HsCodeRecord } from '@/types';

export type HsCodeMatch = HsCodeRecord;

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
};
