/**
 * Input: 出口订单、出柜判定结果、按需加载的商品/库存、装箱弹窗开关、导入与刷新回调
 * Output: 货柜页签：出柜条件（双 80% + 3D 排柜）、容量卡片、装箱明细、40HQ 3D 装柜图、保存为图片
 * Pos: /dashboard/orders/[id] 货柜（UX 规范 §11）；嵌入 container 分支（#124）的判定与 Container3DView，不改装柜算法
 */
"use client";

import { lazy, Suspense, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Camera,
  CheckCircle2,
  CircleDashed,
  Container,
  PackageCheck,
  Weight,
} from "lucide-react";
import { toast } from "sonner";
import type { Inventory, PackingItem, Product, SalesContract } from "@/types";
import { salesService } from "@/services/sales.service";
import { CONTAINER_40HQ, SHIPPING_READY_THRESHOLD_PCT } from "@/lib/binPacking";
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
import { useMobile } from "@/lib/hooks/useMobile";
import { PackingItemsCard } from "./PackingItemsCard";
import { PackingItemDialog } from "./PackingItemDialog";

// 动态导入 3D 组件（避免 SSR 问题）
const Container3DView = lazy(
  () => import("@/components/container/Container3DView"),
);

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

/** 职责：把若干区域截成一张长图下载（3D 直接取 WebGL canvas） */
const saveAsImage = async (
  fileName: string,
  sections: Array<HTMLElement | null>,
  view3d: HTMLElement | null,
) => {
  const { domToPng } = await import("modern-screenshot");
  const images: string[] = [];
  for (const section of sections) {
    if (section) {
      images.push(
        await domToPng(section, { scale: 2, backgroundColor: "#ffffff" }),
      );
    }
  }
  const webglCanvas = view3d?.querySelector("canvas");
  if (webglCanvas) images.push(webglCanvas.toDataURL("image/png"));

  const loaded = await Promise.all(
    images.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img);
          img.src = src;
        }),
    ),
  );
  const maxWidth = Math.max(...loaded.map((img) => img.width));
  const totalHeight = loaded.reduce((sum, img) => sum + img.height + 40, 40);
  const canvas = document.createElement("canvas");
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, maxWidth, totalHeight);
    let y = 20;
    for (const img of loaded) {
      if (img.width > 0) {
        ctx.drawImage(img, (maxWidth - img.width) / 2, y);
        y += img.height + 40;
      }
    }
  }
  const link = document.createElement("a");
  link.download = fileName;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
  const isMobile = useMobile();
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const packingRef = useRef<HTMLDivElement>(null);
  const view3dRef = useRef<HTMLDivElement>(null);
  const packingRows = contract.packingItems ?? [];
  const { readiness, packingPlan, totals, hasShipped, isBlocking } = result;
  const tone = isBlocking
    ? TONE.blocking
    : readiness.ready
      ? TONE.ready
      : TONE.pending;
  const weightPercent = Math.min(
    (totals.grossKg / CONTAINER_40HQ.maxWeight) * 100,
    100,
  );
  const cbmPercent = Math.min(
    (totals.cargoCbm / CONTAINER_40HQ.maxVolume) * 100,
    100,
  );

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

  const handleSaveImage = async () => {
    toast.info("正在生成图片，请稍候...");
    try {
      await saveAsImage(
        `${contract.contractNo}-装箱明细.png`,
        [summaryRef.current, packingRef.current],
        view3dRef.current,
      );
      toast.success("图片已保存");
    } catch (error) {
      console.error("保存图片失败:", error);
      toast.error(
        `保存失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };

  const pctClass = (pct: number) =>
    pct >= SHIPPING_READY_THRESHOLD_PCT
      ? "font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
      : "font-semibold tabular-nums";

  return (
    <div className="space-y-4">
      <div ref={summaryRef} className="space-y-4">
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
                : `（毛重或体积任一利用率 ≥ ${SHIPPING_READY_THRESHOLD_PCT}%）`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Weight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">毛重利用率</span>
            <span className={pctClass(readiness.weightPct)}>
              {readiness.weightPct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              / {CONTAINER_40HQ.maxWeight / 1000}t
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">体积利用率</span>
            <span className={pctClass(readiness.volumePct)}>
              {readiness.volumePct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">
              / {CONTAINER_40HQ.maxVolume} CBM
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Container className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">3D排柜</span>
            <span
              className={`font-semibold ${readiness.physicalFit ? TONE.ready.text : TONE.blocking.text}`}
            >
              已装 {packingPlan.placedBoxes.length} 箱 / 未装{" "}
              {packingPlan.unplacedBoxes.length} 箱
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
                体积 (CBM) / {CONTAINER_40HQ.maxVolume}
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
                毛重 (kg) / {CONTAINER_40HQ.maxWeight.toLocaleString()}
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
        ref={packingRef}
        rows={packingRows}
        hasShipped={hasShipped}
        onAdd={() => openItemDialog(null)}
        onEdit={openItemDialog}
        onDelete={handleDelete}
        onImportPurchase={onImportPurchase}
      />

      <Card ref={view3dRef}>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              3D 装箱可视化
            </CardTitle>
            <CardDescription>
              {CONTAINER_40HQ.code} 标准货柜 ({CONTAINER_40HQ.length}×
              {CONTAINER_40HQ.width}×{CONTAINER_40HQ.height} mm)
            </CardDescription>
          </div>
          <Button variant="outline" onClick={handleSaveImage}>
            <Camera className="mr-2 h-4 w-4" />
            保存为图片
          </Button>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
              3D 装箱视图仅在电脑上提供，手机请查看「装箱明细」
            </div>
          ) : packingRows.length > 0 ? (
            <Suspense
              fallback={
                <div className="flex h-[500px] items-center justify-center">
                  加载3D场景...
                </div>
              }
            >
              <Container3DView packingItems={packingRows} products={products} />
            </Suspense>
          ) : (
            <div className="flex h-[500px] items-center justify-center text-muted-foreground">
              请先添加装箱商品以查看3D效果
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
