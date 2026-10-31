/**
 * Input: 已确认出口订单（明细 + 已生成的采购单）、在用供应商、各商品按供应商的最近采购价
 * Output: 「生成采购单」弹窗：逐行选供应商与采购单价（默认最近一次采购的供应商与价格，否则参考成本），确认后每个供应商一份 DRAFT 采购单
 * Pos: /dashboard/orders/[id] CONFIRMED 的下一步（UX 规范 §4.4 第 1 步）；规则与校验在后端 purchaseContractGenerationService（草稿不是应付）
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SalesContract, Supplier } from "@/types";
import { salesService } from "@/services/sales.service";
import { supplierService } from "@/services/supplier.service";
import { purchaseService } from "@/services/purchase.service";
import { loadPaginatedCatalog } from "@/services/paginatedCatalog";
import type { PriceHistoryWithSuppliers } from "@/services/priceComparison";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pendingPurchaseItems } from "./orderDetailModel";

interface Line {
  include: boolean;
  supplierId: string;
  unitPrice: number;
}

const errorMessage = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string" &&
  error.message.trim()
    ? error.message
    : "生成采购单失败";

export function GeneratePurchaseDraftsDialog({
  open,
  onOpenChange,
  contract,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: SalesContract;
  onGenerated: () => void;
}) {
  const items = useMemo(() => pendingPurchaseItems(contract), [contract]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const productIds = [...new Set(items.map((item) => item.productId))];
    void (async () => {
      try {
        const [allSuppliers, histories] = await Promise.all([
          loadPaginatedCatalog((page) =>
            supplierService.getAll({ page, pageSize: 100, lite: true }),
          ),
          // 单个商品的比价失败只是少一个默认值，不阻断生成
          Promise.all(
            productIds.map((productId) =>
              purchaseService
                .getProductPriceHistory(productId)
                .then(
                  (res) =>
                    [productId, res.data as PriceHistoryWithSuppliers] as const,
                )
                .catch(() => [productId, null] as const),
            ),
          ),
        ]);
        if (!active) return;
        const activeSuppliers = allSuppliers.filter(
          (s) => s.isActive !== false,
        );
        const activeIds = new Set(activeSuppliers.map((s) => s.id));
        const latest = new Map<string, { supplierId: string; price: number }>();
        for (const [productId, history] of histories) {
          const recent = (history?.bySupplier ?? [])
            .filter((row) => activeIds.has(row.supplierId))
            .sort((a, b) => b.lastDate.localeCompare(a.lastDate))[0];
          if (recent) {
            latest.set(productId, {
              supplierId: recent.supplierId,
              price: recent.lastPrice,
            });
          }
        }
        setSuppliers(activeSuppliers);
        setLines(
          Object.fromEntries(
            items.map((item) => {
              const recent = latest.get(item.productId);
              return [
                item.id,
                {
                  include: true,
                  supplierId: recent?.supplierId ?? "",
                  unitPrice: recent?.price ?? item.costPrice ?? 0,
                },
              ];
            }),
          ),
        );
      } catch {
        if (active) toast.error("加载供应商失败");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [items]);

  const update = (id: string, patch: Partial<Line>) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const selected = items.filter((item) => lines[item.id]?.include);
  const incomplete = selected.some(
    (item) => !lines[item.id].supplierId || !(lines[item.id].unitPrice > 0),
  );

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await salesService.generatePurchaseDrafts(
        contract.id,
        selected.map((item) => ({
          salesItemId: item.id,
          supplierId: lines[item.id].supplierId,
          unitPrice: lines[item.id].unitPrice,
        })),
      );
      const numbers = (response.data?.contracts ?? [])
        .map((created) => created.contractNo)
        .join("、");
      toast.success(`采购单已生成（草稿）${numbers ? `：${numbers}` : ""}`);
      onOpenChange(false);
      onGenerated();
    } catch (error: unknown) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>生成采购单</DialogTitle>
          <DialogDescription>
            每个供应商生成一份草稿采购单，门店随明细带入。草稿签订前不计入应付。
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            加载供应商和最近采购价...
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            所有明细都已生成采购单
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>商品</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead className="w-32">采购单价 (¥)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const line = lines[item.id];
                  const name = item.product?.customsName || "未知商品";
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`选择 ${name}`}
                          checked={line?.include ?? false}
                          onCheckedChange={(checked) =>
                            update(item.id, { include: checked === true })
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{item.store?.name || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line?.supplierId || undefined}
                          onValueChange={(supplierId) =>
                            update(item.id, { supplierId })
                          }
                        >
                          <SelectTrigger aria-label={`${name} 供应商`}>
                            <SelectValue placeholder="选择供应商" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
                                {supplier.hasQualityIssue ? "（质量备注）" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`${name} 采购单价`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={line?.unitPrice || ""}
                          onChange={(event) =>
                            update(item.id, {
                              unitPrice: parseFloat(event.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={
              loading || submitting || selected.length === 0 || incomplete
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            生成 {selected.length} 行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
