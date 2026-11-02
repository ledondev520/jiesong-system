/**
 * Input: 商品毛重/净重/体积数值（可能为 null、undefined 或 0）
 * Output: 带单位的展示文本；未填写或为 0 一律显示「未维护」，不伪装成 0kg/0CBM
 * Pos: 商品列表卡片与详情页共用（与后端 incomplete 口径一致：0 视为缺失）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export const NOT_MAINTAINED = "未维护";

export function formatMeasure(
  value: number | null | undefined,
  unit: "kg" | "CBM",
): string {
  return value ? `${value} ${unit}` : NOT_MAINTAINED;
}
