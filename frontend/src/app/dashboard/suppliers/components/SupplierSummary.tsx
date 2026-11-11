/**
 * Input: 当前选中的供应商、onEdit 回调
 * Output: 只读供应商摘要（联系人、税号、别名、质量说明）与显式「编辑」入口；不含收款账户（需进入编辑或详情页），但列出缺失字段名称
 * Pos: 供应商列表点击后的落点，避免点击即进入可保存/归档/删除的编辑表单
 */
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import type { Supplier } from "@/types";
import { MissingFields } from "./MissingFields";

export function SupplierSummary({
  supplier,
  onEdit,
}: {
  supplier: Supplier;
  onEdit: () => void;
}) {
  const facts: [string, string | undefined][] = [
    ["简称", supplier.shortName],
    ["联系人", supplier.contactName],
    ["联系电话", supplier.contactPhone],
    ["邮箱", supplier.contactEmail],
    ["公司电话", supplier.phone],
    ["税号", supplier.taxId],
    ["地址", supplier.address],
    ["别名", supplier.aliases?.map((alias) => alias.alias).join("、")],
  ];
  return (
    <div className="space-y-5 p-5" data-testid="supplier-summary">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{supplier.name}</h3>
        {supplier.isActive === false && (
          <Badge variant="secondary">已归档</Badge>
        )}
        {supplier.hasQualityIssue && (
          <Badge variant="destructive">质量问题</Badge>
        )}
      </div>
      <MissingFields supplier={supplier} />
      <dl className="grid gap-4 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {supplier.hasQualityIssue && supplier.qualityNote && (
        <p className="text-sm text-muted-foreground">
          质量说明：{supplier.qualityNote}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <BusinessWrite>
          <Button type="button" className="h-9 rounded-lg" onClick={onEdit}>
            <Pencil className="mr-1.5 h-4 w-4" />
            编辑
          </Button>
        </BusinessWrite>
        <Button asChild variant="outline" className="h-9 rounded-lg">
          <Link
            href={`/dashboard/suppliers/${encodeURIComponent(supplier.id)}`}
          >
            查看供货商品与价格
          </Link>
        </Button>
      </div>
    </div>
  );
}
