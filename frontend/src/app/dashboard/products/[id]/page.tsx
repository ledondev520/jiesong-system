/**
 * Input: 商品详情 API、GET /purchases/price-history/:productId
 * Output: 商品详情页：概览与只读「采购价格」页签（各供应商比价）
 * Pos: 采购模块商品档案详情，只读，不改变商品写入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierPriceComparison } from "@/components/purchase/SupplierPriceComparison";
import { productService } from "@/services/product.service";
import { purchaseService } from "@/services/purchase.service";
import type { PriceHistoryWithSuppliers } from "@/services/priceComparison";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
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
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.customsName}
        backHref="/dashboard/products"
        description={product.description}
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
    </div>
  );
}
