/**
 * Input: /api/v1/procurement-template/* 三个端点
 * Output: 通用采购模板、门店列表、指定门店历史采购清单的类型定义和请求方法
 * Pos: 前端服务层，对接后端CSV分析接口
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import { ApiResponse } from '@/types';

// ==================== 类型定义 ====================

/** 通用模板中的单个采购项 */
export interface TemplateItem {
  name: string;
  supplement: string;
  category: string;
  storeCount: number;
  frequency: number;
  priority: '强烈建议' | '建议' | '可选';
  isTemplateStore: boolean;      // 是否为密歇根模板店采购过的物品
  avgQtyPerStore: number | null; // 每家门店平均采购量（均值）
  unit: string;
  manufacturers: string[];
  totalAmount: number;
  rowCount: number;
}

/** 通用模板（跨所有门店分析结果） */
export interface UniversalTemplate {
  totalStores: number;
  totalProducts: number;
  mustHaveCount: number;
  templateStore: string;         // 参照模板门店（密歇根）
  items: TemplateItem[];
  byCategory: Record<string, TemplateItem[]>;
}

/** 指定门店的历史采购明细项 */
export interface StoreItem {
  name: string;
  supplement: string;
  category: string;
  totalQty: number;
  unit: string;
  manufacturer: string;
  spec: string;
  totalAmount: number;
  shipments: Array<{ date: string; qty: number; amount: number; spec: string }>;
}

/** 指定门店的完整采购清单 */
export interface StoreTemplate {
  storeName: string;
  totalProducts: number;
  totalAmount: number;
  items: StoreItem[];
  byCategory: Record<string, StoreItem[]>;
}

// ==================== 服务方法 ====================

export const procurementTemplateService = {
  /**
   * 职责：获取CSV中所有门店列表（去重并规范化）
   */
  getStoreList: () =>
    api.get<ApiResponse<string[]>, ApiResponse<string[]>>('/procurement-template/stores'),

  /**
   * 职责：获取跨所有门店的通用采购模板（含优先级、品类分组）
   */
  getUniversalTemplate: () =>
    api.get<ApiResponse<UniversalTemplate>, ApiResponse<UniversalTemplate>>(
      '/procurement-template/universal',
    ),

  /**
   * 职责：获取指定门店的历史采购明细
   * @param storeName 门店名称
   */
  getStoreTemplate: (storeName: string) =>
    api.get<ApiResponse<StoreTemplate>, ApiResponse<StoreTemplate>>(
      `/procurement-template/stores/${encodeURIComponent(storeName)}`,
    ),
};
