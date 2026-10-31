import api, { type ApiRequestConfig } from "@/lib/axios";
import type { ApiResponse } from "@/types";

export interface CategoryMarkup {
  categoryId: string;
  categoryName: string;
  markup: number;
}

export interface PricingConfig {
  exchangeRate: number;
  exchangeAdjustment: number;
  defaultMarkup: number;
  categoryMarkups: CategoryMarkup[];
}

export interface PricingSnapshot {
  config: PricingConfig;
  revision: string;
}

export interface PricingPreview {
  status: "OK" | "MISSING_COST" | "INVALID_RATE";
  unitPriceUsd: number | null;
}

export const pricingService = {
  get: () =>
    api.get<ApiResponse<PricingSnapshot>, ApiResponse<PricingSnapshot>>(
      "/system/pricing-config",
      { cache: { enabled: false } } as ApiRequestConfig,
    ),
  save: (config: PricingConfig, revision: string) =>
    api.put<ApiResponse<PricingSnapshot>, ApiResponse<PricingSnapshot>>(
      "/system/pricing-config",
      { config, revision },
    ),
  // 预览由服务端 priceFor 计算（唯一实现）；draft 为未保存的草稿，仅校验不写文件
  preview: (params: {
    costCny: number;
    categoryId?: string;
    config?: PricingConfig;
  }) =>
    api.get<ApiResponse<PricingPreview>, ApiResponse<PricingPreview>>(
      "/system/pricing-config/preview",
      {
        params: {
          costCny: params.costCny,
          categoryId: params.categoryId,
          config: params.config ? JSON.stringify(params.config) : undefined,
        },
        cache: { enabled: false },
      } as ApiRequestConfig,
    ),
};
