/**
 * Input: 出口订单、出柜判定结果、按需加载的商品/库存、装箱弹窗开关、导入与刷新回调
 * Output: 货柜页签：出柜条件（双 80% + 排柜结果）、容量卡片、装箱明细、装柜面板（摘要、柜型模拟、3D/手机 2D、打印与 PNG/PDF 导出）
 * Pos: /dashboard/orders/[id] 货柜（UX 规范 §11）；排柜与门槛只渲染后端 loading-plan，不在前端排柜
 */
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Container,
  PackageCheck,
  Weight,
} from "lucide-react";
import { toast } from "sonner";
import type { Inventory, PackingItem, Product, SalesContract } from "@/types";
import { salesService } from "@/services/sales.service";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { OrderReadiness } from "./orderDetailModel";
import ContainerLoadingPanel from "@/components/container/ContainerLoadingPanel";
import { PackingItemsCard } from "./PackingItemsCard";
import { PackingItemDialog } from "./PackingItemDialog";

const TONE = {
  blocking: {
    box: "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-400",
  },
  ready: {
    box: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  pending: {
    box: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-400",
  },
};

export function OrderContainerTab({
  contract,
  products,
  inventories,
  referenceDataLoading,
  readiness: result,
  itemDialogOpen,
  onItemDialogOpenChange,
  onImportPurchase,
  onChanged,
}: {
  contract: SalesContract;
  products: Product[];
  inventories: Inventory[];
  referenceDataLoading: boolean;
  readiness: OrderReadiness;
  itemDialogOpen: boolean;
  onItemDialogOpenChange: (open: boolean) => void;
  onImportPurchase: () => void;
  onChanged: () => void;
}) {
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);
  const packingRows = contract.packingItems ?? [];
  const { readiness, summary, plan, totals, hasShipped, isBlocking } = result;
  const spec = plan?.container;
  const maxWeight = spec?.safeGrossKg ?? 0;
  const maxCbm = spec?.safeVolumeCbm ?? 0;
  const thresholdPct = summary.thresholdPct ?? Infinity;
  const tone = isBlocking
    ? TONE.blocking
    : readiness.ready
      ? TONE.ready
      : TONE.pending;
  const weightPercent = maxWeight
    ? Math.min((totals.grossKg / maxWeight) * 100, 100)
    : 0;
  const cbmPercent = maxCbm
    ? Math.min((totals.cargoCbm / maxCbm) * 100, 100)
    : 0;

  const openItemDialog = (item: PackingItem | null) => {
    setEditingItem(item);
    onItemDialogOpenChange(true);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm("确定要删除这个商品吗？")) return;
    try {
      await salesService.removePackingItem(contract.id, itemId);
      toast.success("商品已删除");
      onChanged();
    } catch {
      toast.error("删除失败");
    }
  };

  const pctClass = (pct: number) =>
    pct >= thresholdPct
      ? "font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
      : "font-semibold tabular-nums";

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {/* 出柜条件（双80%指标）：毛重或体积任一利用率 ≥ 阈值且全部箱件可装下 */}
        <div
          className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3 ${tone.box}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {isBlocking ? (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            ) : readiness.ready ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <CircleDashed className="h-5 w-5 text-amber-600" />
            )}
            <span className={`text-sm font-semibold ${tone.text}`}>
              {result.headline}
            </span>
            <span className="text-xs text-muted-foreground">
              {hasShipped
                ? "当前资料的模拟结果，不代表实际发运结果"
                : summary.thresholdPct !== null
                  ? `（毛重或体积任一利用率 ≥ ${summary.thresholdPct}%）`
                  : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Weight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">毛重利用率</span>
            <span className={pctClass(readiness.weightPct)}>
              {readiness.weightPct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">/ {maxWeight / 1000}t</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">体积利用率</span>
            <span className={pctClass(readiness.volumePct)}>
              {readiness.volumePct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">/ {maxCbm} CBM</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Container className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">3D排柜</span>
            <span
              className={`font-semibold ${readiness.physicalFit ? TONE.ready.text : TONE.blocking.text}`}
            >
              已装 {summary.placedBoxCount} 箱 / 未装 {summary.unplacedBoxCount}{" "}
              箱
            </span>
          </div>
          {result.estimatedDimensionCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.estimatedDimensionCount} 项尺寸由体积推算，
              {hasShipped ? "需核对历史装箱资料" : "出货前需复核"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totals.cartons}</div>
              <p className="text-xs text-muted-foreground">总箱数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {totals.cargoCbm.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                体积 (CBM) / {maxCbm}
              </p>
              <Progress value={cbmPercent} className="mt-2 h-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {totals.grossKg.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                毛重 (kg) / {maxWeight.toLocaleString()}
                {" · "}净重 {(contract.netWeight || 0).toLocaleString()} kg
              </p>
              <Progress value={weightPercent} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>
        {contract.isFumigated && (
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <PackageCheck className="h-3.5 w-3.5" />
            <span>已熏蒸处理</span>
          </div>
        )}
      </div>

      <PackingItemsCard
        rows={packingRows}
        hasShipped={hasShipped}
        onAdd={() => openItemDialog(null)}
        onEdit={openItemDialog}
        onDelete={handleDelete}
        onImportPurchase={onImportPurchase}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            装柜计划
          </CardTitle>
          <CardDescription>
            {spec
              ? `${spec.label} (${spec.innerMm.length}×${spec.innerMm.width}×${spec.innerMm.height} mm)`
              : "装柜计划加载中"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plan && packingRows.length > 0 ? (
            <ContainerLoadingPanel
              plan={plan}
              salesContractId={contract.id}
              contractNo={contract.contractNo}
              historical={hasShipped}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              {packingRows.length === 0
                ? "请先添加装箱商品以查看装柜效果"
                : "装柜计划加载中"}
            </div>
          )}
        </CardContent>
      </Card>

      {itemDialogOpen && (
        <PackingItemDialog
          key={editingItem?.id ?? "new"}
          salesContractId={contract.id}
          editingItem={editingItem}
          products={products}
          inventories={inventories}
          referenceDataLoading={referenceDataLoading}
          hasShipped={hasShipped}
          onOpenChange={onItemDialogOpenChange}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
