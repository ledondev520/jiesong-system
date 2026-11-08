/**
 * Input: 出口订单（items 含商品与门店）、含港口关联的门店、合同头保存回调
 * Output: 明细页签：只读「商品 × 门店」数量网格（单价、金额）+ 原合同头编辑器
 * Pos: /dashboard/orders/[id] 明细；网格与新建页同形（UX 规范 §4.2）；A84 起可行内改数量/单价（后端复核角色与锁定）
 */
"use client";

import { useMemo, useState } from "react";
import type { SalesContract, Store } from "@/types";
import { formatMoney, formatUnitPrice } from "@/lib/format";
import { MISSING_VALUE } from "@/lib/missing-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContractInfoEditor } from "@/components/sales/ContractInfoEditor";

const buildGrid = (contract: SalesContract) => {
  const stores = new Map<string, string>();
  const products = new Map<
    string,
    {
      productId: string;
      name: string;
      specification?: string;
      price: number;
      quantities: Map<string, number>;
      total: number;
      amount: number;
    }
  >();
  for (const item of contract.items ?? []) {
    const storeKey = item.storeId || "";
    if (!stores.has(storeKey))
      stores.set(storeKey, item.store?.name || "未分门店");
    let row = products.get(item.productId);
    if (!row) {
      row = {
        productId: item.productId,
        name: item.product?.customsName || "未知商品",
        specification: item.specification || item.product?.specification,
        price: item.sellingPrice,
        quantities: new Map(),
        total: 0,
        amount: 0,
      };
      products.set(item.productId, row);
    }
    row.quantities.set(
      storeKey,
      (row.quantities.get(storeKey) || 0) + item.quantity,
    );
    row.total += item.quantity;
    row.amount += item.quantity * (item.sellingPrice || 0);
  }
  return { stores: [...stores], rows: [...products.values()] };
};

export type LineChange = {
  itemId: string;
  data: { quantity?: number; sellingPrice?: number };
};

// 仅当「商品×门店」格只对应一条明细时才可改数量；单价按商品改，作用于该商品的所有明细行。
const buildChanges = (
  contract: SalesContract,
  qtyEdits: Record<string, string>,
  priceEdits: Record<string, string>,
): LineChange[] => {
  const items = contract.items ?? [];
  const cellCount = new Map<string, number>();
  for (const item of items) {
    const key = `${item.productId}|${item.storeId || ""}`;
    cellCount.set(key, (cellCount.get(key) || 0) + 1);
  }
  const changes: LineChange[] = [];
  for (const item of items) {
    const data: LineChange["data"] = {};
    const cell = `${item.productId}|${item.storeId || ""}`;
    const qty = qtyEdits[cell];
    if (cellCount.get(cell) === 1 && qty !== undefined && qty !== "") {
      if (Number(qty) !== item.quantity) data.quantity = Number(qty);
    }
    const price = priceEdits[item.productId];
    if (
      price !== undefined &&
      price !== "" &&
      Number(price) !== item.sellingPrice
    ) {
      data.sellingPrice = Number(price);
    }
    if (Object.keys(data).length) changes.push({ itemId: item.id, data });
  }
  return changes;
};

export function OrderLinesTab({
  contract,
  stores,
  onSave,
  canEditLines = false,
  onReprice,
}: {
  contract: SalesContract;
  stores: Store[];
  onSave: (data: Partial<SalesContract>) => Promise<void>;
  /** 角色允许且订单未发运/取消；后端仍会复核。 */
  canEditLines?: boolean;
  onReprice?: (
    changes: LineChange[],
  ) => Promise<{ totalFromPacking?: boolean } | void>;
}) {
  const grid = useMemo(() => buildGrid(contract), [contract]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packingNote, setPackingNote] = useState(false);
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const singleItemCells = useMemo(() => {
    const count = new Map<string, number>();
    for (const item of contract.items ?? []) {
      const key = `${item.productId}|${item.storeId || ""}`;
      count.set(key, (count.get(key) || 0) + 1);
    }
    return count;
  }, [contract]);
  const stopEditing = () => {
    setEditing(false);
    setQtyEdits({});
    setPriceEdits({});
  };
  const saveLines = async () => {
    const changes = buildChanges(contract, qtyEdits, priceEdits);
    if (!changes.length || !onReprice) return stopEditing();
    setSaving(true);
    try {
      const result = await onReprice(changes);
      setPackingNote(Boolean(result?.totalFromPacking));
      stopEditing();
    } catch {
      // 失败时保留输入供重试；提示由调用方给出。
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-semibold">
            商品 × 门店
            {canEditLines && grid.rows.length > 0 && onReprice ? (
              editing ? (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={stopEditing}
                  >
                    取消
                  </Button>
                  <Button size="sm" disabled={saving} onClick={saveLines}>
                    保存明细
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  编辑明细
                </Button>
              )
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {grid.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无订单明细行
              {contract.packingItems?.length
                ? `；装箱明细有 ${contract.packingItems.length} 行（发运条件以装箱明细为准，见“货柜”）`
                : ""}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table framed={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead className="text-right">单价 (USD)</TableHead>
                    {grid.stores.map(([storeId, name]) => (
                      <TableHead key={storeId} className="text-right">
                        {name}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">合计</TableHead>
                    <TableHead className="text-right">金额 (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grid.rows.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">
                        {row.name}
                        {row.specification && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({row.specification})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {editing ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`${row.name} 单价`}
                            className="ml-auto h-8 w-24 text-right"
                            value={
                              priceEdits[row.productId] ?? String(row.price)
                            }
                            onChange={(event) =>
                              setPriceEdits((prev) => ({
                                ...prev,
                                [row.productId]: event.target.value,
                              }))
                            }
                          />
                        ) : row.price ? (
                          formatUnitPrice(row.price, "USD")
                        ) : (
                          MISSING_VALUE
                        )}
                      </TableCell>
                      {grid.stores.map(([storeId]) => (
                        <TableCell
                          key={storeId}
                          className="text-right tabular-nums"
                        >
                          {editing &&
                          singleItemCells.get(`${row.productId}|${storeId}`) ===
                            1 ? (
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              aria-label={`${row.name} ${stores.find((s) => s.id === storeId)?.name ?? "门店"} 数量`}
                              className="ml-auto h-8 w-20 text-right"
                              value={
                                qtyEdits[`${row.productId}|${storeId}`] ??
                                String(row.quantities.get(storeId))
                              }
                              onChange={(event) =>
                                setQtyEdits((prev) => ({
                                  ...prev,
                                  [`${row.productId}|${storeId}`]:
                                    event.target.value,
                                }))
                              }
                            />
                          ) : (
                            (row.quantities.get(storeId)?.toLocaleString() ??
                            MISSING_VALUE)
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.amount, "USD")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {packingNote && (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              明细已更新；该订单已有装箱明细，合同总额以装箱明细为准，未随本次改价变化。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 合同信息：普通保存成功后刷新，失败交回编辑器保留草稿供明确重试。 */}
      <ContractInfoEditor contract={contract} stores={stores} onSave={onSave} />
    </div>
  );
}
