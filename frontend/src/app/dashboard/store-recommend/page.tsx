/**
 * Input: procurementTemplateService（门店列表、通用模板、门店历史采购）
 * Output: 采购建议动态清单页面（单一入口，选择客户后展示推荐商品与缺购商品）
 * Pos: 采购模块子页面，已合并原 3 Tab（开业模板/AI建议/统计）为统一动态清单
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { StoreRecommendPageContent } from './components/StoreRecommendPageContent';

export default function StoreRecommendPage() {
  return <StoreRecommendPageContent />;
}
