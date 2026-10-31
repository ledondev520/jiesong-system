/**
 * Input: 订单行（商品或分类 + 单位采购成本 ¥）、可选订单现汇
 * Output: 每行建议单价（整美元后取整到 5 的倍数）与实际使用的现汇
 * Pos: 订单编辑器的实时报价预览（POST /pricing/preview，只读计算）
 */
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";

export interface PricingPreviewLine {
  productId?: string;
  categoryId?: string;
  costCny?: number;
}
export interface PricingPreviewResult {
  index: number;
  status: "OK" | "MISSING_COST" | "INVALID_RATE";
  unitPriceUsd: number | null;
  markup: number | null;
  effectiveRate: number | null;
}
export interface PricingPreviewResponse {
  results: PricingPreviewResult[];
  spotRate: number;
}

export const pricingPreviewService = {
  preview: (lines: PricingPreviewLine[], spotRate?: number) =>
    api.post<
      ApiResponse<PricingPreviewResponse>,
      ApiResponse<PricingPreviewResponse>
    >("/pricing/preview", { lines, ...(spotRate ? { spotRate } : {}) }),
};
