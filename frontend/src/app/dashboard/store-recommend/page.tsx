/**
 * Input: 门店采购建议API（storeRecommendService）+ 开业采购模板API（procurementTemplateService）
 * Output: 门店采购建议看板页面（含AI推荐、CSV实数据两套视图）
 * Pos: 功能页面，展示门店采购分析、AI建议、以及基于历史数据的开业采购模板
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { StoreRecommendPageContent } from './components/StoreRecommendPageContent';

export default function StoreRecommendPage() {
  return <StoreRecommendPageContent />;
}
