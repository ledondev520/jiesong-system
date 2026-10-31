/**
 * Input: GET /purchases/price-history/:productId 的 bySupplier 扩展字段
 * Output: 供应商比价类型（purchase.service 的 ProductPriceHistory 不含 bySupplier）
 * Pos: 比价弹层、商品/供应商详情页共用类型
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import type { ProductPriceHistory } from "./purchase.service";

export interface SupplierPriceSummary {
  supplierId: string;
  supplierName: string;
  hasQualityIssue: boolean;
  lastPrice: number;
  lastDate: string;
  lastContractNo: string;
  lastTaxRate: number;
  minPrice: number;
  averagePrice: number;
  count: number;
}

/** bySupplier 按最近价升序；旧后端无此字段 */
export type PriceHistoryWithSuppliers = ProductPriceHistory & {
  bySupplier?: SupplierPriceSummary[];
};
