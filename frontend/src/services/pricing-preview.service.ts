/**
 * Input: 订单行（商品或分类 + 单位采购成本 ¥）、可选订单现汇
 * Output: 每行建议单价（老商品为上次确认价 LAST_CONFIRMED，否则公式价 RULE，向上取整到整美元）与实际使用的现汇
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
  /** 公式价（不含上次确认价）；缺成本时为 null */
  formulaPriceUsd: number | null;
  source: "LAST_CONFIRMED" | "RULE";
  markup: number | null;
  effectiveRate: number | null;
}
export interface PricingPreviewResponse {
  results: PricingPreviewResult[];
  spotRate: number;
}

export const pricingPreviewService = {
  // excludeQuoteId：正在编辑的报价不参与自己的预填价
  preview: (
    lines: PricingPreviewLine[],
    spotRate?: number,
    excludeQuoteId?: string,
  ) =>
    api.post<
      ApiResponse<PricingPreviewResponse>,
      ApiResponse<PricingPreviewResponse>
    >("/pricing/preview", {
      lines,
      ...(spotRate ? { spotRate } : {}),
      ...(excludeQuoteId ? { excludeQuoteId } : {}),
    }),
};
