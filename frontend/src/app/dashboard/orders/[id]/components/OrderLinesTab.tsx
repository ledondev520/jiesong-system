/**
 * Input: 出口订单（items 含商品与门店）、含港口关联的门店、合同头保存回调
 * Output: 明细页签：只读「商品 × 门店」数量网格（单价、金额）+ 原合同头编辑器
 * Pos: /dashboard/orders/[id] 明细；网格与新建页同形（UX 规范 §4.2），编辑明细仍待订单编辑页
 */
"use client";

import { useMemo } from "react";
import type { SalesContract, Store } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function OrderLinesTab({
  contract,
  stores,
  onSave,
}: {
  contract: SalesContract;
  stores: Store[];
  onSave: (data: Partial<SalesContract>) => Promise<void>;
}) {
  const grid = useMemo(() => buildGrid(contract), [contract]);

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">商品 × 门店</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {grid.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无订单明细
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead className="text-right">单价 ($)</TableHead>
                    {grid.stores.map(([storeId, name]) => (
                      <TableHead key={storeId} className="text-right">
                        {name}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">合计</TableHead>
                    <TableHead className="text-right">金额 ($)</TableHead>
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
                        {row.price ? row.price.toLocaleString() : "-"}
                      </TableCell>
                      {grid.stores.map(([storeId]) => (
                        <TableCell
                          key={storeId}
                          className="text-right tabular-nums"
                        >
                          {row.quantities.get(storeId)?.toLocaleString() ?? "-"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.amount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 合同信息：普通保存成功后刷新，失败交回编辑器保留草稿供明确重试。 */}
      <ContractInfoEditor contract={contract} stores={stores} onSave={onSave} />
    </div>
  );
}
