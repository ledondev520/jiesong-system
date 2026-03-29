/**
 * Input: HSCode 查询参数（keyword 商品名称 / code HS 编码前缀）
 * Output: HSCode 前端服务
 * Pos: 商品管理页智能匹配服务层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
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
  /**
   * 职责：列表/搜索 HS 编码
   * @param keyword - 商品名称关键词（模糊搜索）
   * @param code - HS 编码前缀（纯数字，前缀精确匹配）
   * @param fuzzy - 启用相似度模糊搜索（有 keyword 或 code 时才生效）
   */
  list: async ({
    keyword = '',
    code = '',
    page = 1,
    pageSize = 20,
    fuzzy = false,
  }: {
    keyword?: string;
    /** HS 编码前缀（纯数字，独立于商品名称搜索） */
    code?: string;
    page?: number;
    pageSize?: number;
    fuzzy?: boolean;
  } = {}) => {
    return api.get<
      ApiResponse<PaginatedResponse<HsCodeRecord & { similarity?: number; fuzzy?: boolean }>>,
      ApiResponse<PaginatedResponse<HsCodeRecord & { similarity?: number; fuzzy?: boolean }>>
    >('/hs-codes', {
      params: {
        keyword: keyword || undefined,
        code: code || undefined,
        page,
        pageSize,
        fuzzy: fuzzy ? 'true' : undefined,
      },
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
