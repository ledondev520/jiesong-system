/**
 * Input: 商品详情 API、GET /purchases/price-history/:productId
 * Output: 商品详情页：概览与只读「采购价格」页签（各供应商比价）；页底「危险操作」区放删除（确认弹窗命名商品）
 * Pos: 采购模块商品档案详情；删除只在这里，列表卡片不再提供
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMeasure } from "../measure";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierPriceComparison } from "@/components/purchase/SupplierPriceComparison";
import { productService } from "@/services/product.service";
import { purchaseService } from "@/services/purchase.service";
import type { PriceHistoryWithSuppliers } from "@/services/priceComparison";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<PriceHistoryWithSuppliers | null>(
    null,
  );
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [productRes, historyRes] = await Promise.all([
        productService.getById(id),
        purchaseService.getProductPriceHistory(id),
      ]);
      setProduct(productRes.data);
      setHistory(historyRes.data);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await productService.delete(id);
      toast.success("商品已删除");
      setConfirmOpen(false);
      router.push("/dashboard/products");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error" || !product) {
    return (
      <ErrorState
        title="商品加载失败"
        action={<Button onClick={() => void load()}>重试</Button>}
      />
    );
  }

  const facts: [string, string | undefined][] = [
    ["规格", product.specification],
    ["单位", product.unit],
    ["HS 编码", product.hsCode],
    ["包装规格", product.packingSpec],
    ["毛重", formatMeasure(product.grossWeight, "kg")],
    ["净重", formatMeasure(product.netWeight, "kg")],
    ["体积", formatMeasure(product.volume, "CBM")],
    [
      "可用库存",
      product.availableStock != null
        ? String(product.availableStock)
        : undefined,
    ],
    [
      "低库存阈值",
      product.lowStockThreshold != null
        ? String(product.lowStockThreshold)
        : undefined,
    ],
    ["申报要素", product.declaration],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.customsName}
        backHref="/dashboard/products"
        description={product.description}
        actions={
          product.isActive === false ? (
            <Badge variant="secondary">已停用</Badge>
          ) : undefined
        }
      />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="prices">采购价格</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <dl className="grid gap-4 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>
        <TabsContent value="prices">
          <SupplierPriceComparison rows={history?.bySupplier ?? []} />
        </TabsContent>
      </Tabs>
      {product.isActive !== false && (
        <BusinessWrite>
          <section
            aria-label="危险操作"
            className="space-y-3 rounded-lg border border-destructive/30 p-4"
          >
            <h3 className="text-sm font-semibold text-destructive">危险操作</h3>
            <p className="text-xs text-muted-foreground">
              商品是订单、库存和报关共用的基础档案。删除「{product.customsName}
              」后该商品停用：不再用于新建单据，已有订单、库存和报关单据中的引用保持不变。
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-destructive/30 text-sm text-destructive hover:bg-destructive/5 hover:text-destructive"
              disabled={deleting}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              删除商品
            </Button>
          </section>
        </BusinessWrite>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除商品 <strong>{product.customsName}</strong> 吗？
              <br />
              删除后该商品停用，不再用于新建单据；已有单据中的引用保持不变。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
