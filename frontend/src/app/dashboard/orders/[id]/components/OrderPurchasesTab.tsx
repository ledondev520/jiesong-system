/**
 * Input: 出口订单详情的 purchaseContracts（由本订单生成的采购单，只含数量与状态）
 * Output: 采购页签：关联采购单列表（编号、供应商、状态、行数、数量），草稿不计应付的提示
 * Pos: /dashboard/orders/[id] 采购（UX 规范 §4.2）
 */
"use client";

import Link from "next/link";
import type { SalesContract } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function OrderPurchasesTab({ contract }: { contract: SalesContract }) {
  const purchases = contract.purchaseContracts ?? [];

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">关联采购单</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {purchases.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            尚未从本订单生成采购单
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>采购单号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">行数</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/dashboard/purchase/${purchase.id}`}
                        className="text-primary hover:underline"
                      >
                        {purchase.contractNo}
                      </Link>
                    </TableCell>
                    <TableCell>{purchase.supplier?.name || "-"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={purchase.status}
                        domain="purchaseContract"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {purchase.items.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {purchase.items
                        .reduce((sum, item) => sum + (item.quantity || 0), 0)
                        .toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          草稿采购单尚未生效，不计入应付。
        </p>
      </CardContent>
    </Card>
  );
}
