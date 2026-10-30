/**
 * Input: 供应商详情 API（含 ProductSupplier 商品）、GET /purchases/price-history/:productId
 * Output: 供应商详情页：基本信息与只读「供货商品」（本供应商的最近价/最低/均价/次数）
 * Pos: 采购模块供应商档案详情，只读，不改变供应商写入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supplierService } from "@/services/supplier.service";
import { purchaseService } from "@/services/purchase.service";
import type {
  PriceHistoryWithSuppliers,
  SupplierPriceSummary,
} from "@/services/priceComparison";
import type { Product, Supplier } from "@/types";

// 每个商品一次价格历史请求，超出上限的商品只显示报价
const MAX_PRICED_PRODUCTS = 20;

// 单个商品的比价失败只影响该行，不拖垮整页
async function loadSupplierRows(
  productId: string,
): Promise<SupplierPriceSummary[]> {
  try {
    const res = await purchaseService.getProductPriceHistory(productId);
    return (res.data as PriceHistoryWithSuppliers).bySupplier ?? [];
  } catch {
    return [];
  }
}

type SupplierDetail = Supplier & {
  products?: { product: Product; price?: number | null }[];
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [summaries, setSummaries] = useState<
    Record<string, SupplierPriceSummary | undefined>
  >({});
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await supplierService.getById(id);
      const detail = res.data as SupplierDetail;
      const products = (detail.products ?? []).slice(0, MAX_PRICED_PRODUCTS);
      const histories = await Promise.all(
        products.map((item) => loadSupplierRows(item.product.id)),
      );
      const next: Record<string, SupplierPriceSummary | undefined> = {};
      products.forEach((item, index) => {
        next[item.product.id] = histories[index].find(
          (row) => row.supplierId === id,
        );
      });
      setSupplier(detail);
      setSummaries(next);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <LoadingState />;
  if (state === "error" || !supplier) {
    return (
      <ErrorState
        title="供应商加载失败"
        action={<Button onClick={() => void load()}>重试</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        backHref="/dashboard/suppliers"
        description={[supplier.contactName, supplier.contactPhone]
          .filter(Boolean)
          .join(" · ")}
        actions={
          supplier.hasQualityIssue ? (
            <Badge variant="destructive">质量问题</Badge>
          ) : undefined
        }
      />
      <section className="space-y-2">
        <h2 className="text-base font-semibold">供货商品</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品</TableHead>
              <TableHead className="text-right">报价</TableHead>
              <TableHead className="text-right">最近单价</TableHead>
              <TableHead className="text-right">最低 / 均价</TableHead>
              <TableHead className="text-right">次数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(supplier.products ?? []).map(({ product, price }) => {
              const row = summaries[product.id];
              return (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="hover:underline"
                    >
                      {product.customsName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {price == null ? "—" : `¥${price}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row ? `¥${row.lastPrice}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row ? `¥${row.minPrice} / ¥${row.averagePrice}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row?.count ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
