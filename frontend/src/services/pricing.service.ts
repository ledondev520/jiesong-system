import api, { type ApiRequestConfig } from "@/lib/axios";
import type { ApiResponse } from "@/types";

export interface PricingConfig {
  mode: "tiered" | "multiplier";
  exchangeAdjustment: number;
  refundableMarkup: number;
  noRefundMarkup: number;
  multiplier: number;
}

export interface PricingSnapshot {
  config: PricingConfig;
  revision: string;
  schema: {
    properties: Record<
      keyof PricingConfig,
      { minimum?: number; maximum?: number; enum?: string[] }
    >;
  };
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
};
