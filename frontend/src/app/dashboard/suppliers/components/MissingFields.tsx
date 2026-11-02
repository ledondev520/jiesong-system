/**
 * Input: 供应商档案
 * Output: 「待完善」徽标与缺失字段清单；资料齐全时不渲染
 * Pos: 供应商列表卡片与只读摘要共用，说明「待完善」到底缺什么
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { Badge } from "@/components/ui/badge";
import type { Supplier } from "@/types";
import { missingSupplierFields } from "../supplierCompleteness";

export function MissingFields({
  supplier,
  compact = false,
}: {
  supplier: Supplier;
  compact?: boolean;
}) {
  const missing = missingSupplierFields(supplier);
  if (missing.length === 0) return null;
  const list = missing.join("、");
  const text = `缺：${list}`;
  return compact ? (
    <p className="truncate" title={text} data-testid="supplier-missing">
      <Badge
        variant="secondary"
        className="mr-1.5 rounded-full px-2 py-0 text-[11px]"
      >
        待完善 {missing.length} 项
      </Badge>
      {text}
    </p>
  ) : (
    <p
      className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
      data-testid="supplier-missing"
    >
      <span className="font-medium">待完善：</span>
      {list}。点击「编辑」补充后即可从待完善中移除。
    </p>
  );
}
