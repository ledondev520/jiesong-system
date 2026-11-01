/**
 * Input: 装箱明细行、是否已发运、编辑/删除/新增/导入回调
 * Output: 装箱明细卡片：桌面可排序表格 + 手机卡片（md 以下），发运后禁止增删
 * Pos: /dashboard/orders/[id] 货柜页签的装箱明细
 */
"use client";

import { forwardRef, useCallback } from "react";
import { Package, PackageCheck, Pencil, Plus, Trash } from "lucide-react";
import type { PackingItem } from "@/types";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { useMobile } from "@/lib/hooks/useMobile";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { MobileListCard } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY_TEXT = "暂无装箱商品，可从已完工采购导入，也可手动添加";

const money = (value?: number | null) =>
  value ? `$${value.toLocaleString()}` : "-";

interface PackingItemsCardProps {
  rows: PackingItem[];
  hasShipped: boolean;
  onAdd: () => void;
  onEdit: (item: PackingItem) => void;
  onDelete: (itemId: string) => void;
  onImportPurchase: () => void;
}

export const PackingItemsCard = forwardRef<
  HTMLDivElement,
  PackingItemsCardProps
>(function PackingItemsCard(
  { rows, hasShipped, onAdd, onEdit, onDelete, onImportPurchase },
  ref,
) {
  const isMobile = useMobile();
  const accessor = useCallback((item: PackingItem, key: string) => {
    switch (key) {
      case "productName":
        return item.product?.customsName ?? "";
      case "quantity":
        return item.quantity;
      case "boxes":
        return item.boxes ?? null;
      case "unitPrice":
        return item.unitPrice ?? null;
      case "totalPrice":
        return item.totalPrice ?? null;
      case "grossWeight":
        return item.grossWeight ?? null;
      default:
        return null;
    }
  }, []);
  const sort = useTableSort(rows, accessor);
  const name = (item: PackingItem) => item.product?.customsName || "装箱商品";
  const sortHead = (key: string, label: string, right = true) => (
    <SortableTableHead
      sortKey={key}
      currentSortKey={sort.sortKey}
      currentSortDir={sort.sortDir}
      onSort={sort.onSort}
      className={right ? "text-right" : undefined}
    >
      {label}
    </SortableTableHead>
  );

  return (
    <Card ref={ref}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            装箱明细
          </CardTitle>
          <CardDescription>
            {hasShipped
              ? "已发运：不能增删商品或修改出库数量，仍可补充单证资料"
              : "管理货柜内的商品"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessWrite>
            <Button
              variant="outline"
              onClick={onImportPurchase}
              disabled={hasShipped}
            >
              <PackageCheck className="mr-2 h-4 w-4" /> 从已完工采购导入
            </Button>
          </BusinessWrite>
          <BusinessWrite>
            <Button variant="outline" onClick={onAdd} disabled={hasShipped}>
              <Plus className="mr-2 h-4 w-4" /> 手动添加商品
            </Button>
          </BusinessWrite>
        </div>
      </CardHeader>
      <CardContent>
        {isMobile ? (
          <div className="space-y-3">
            {sort.sortedData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {EMPTY_TEXT}
              </p>
            ) : (
              sort.sortedData.map((item) => (
                <MobileListCard
                  key={item.id}
                  title={item.product?.customsName || "未知商品"}
                  subtitle={[
                    item.specification || item.product?.specification,
                    item.purchaseContractNo
                      ? `来源 ${item.purchaseContractNo}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  fields={[
                    { label: "数量", value: item.quantity ?? "-" },
                    { label: "箱数", value: item.boxes ?? "-" },
                    {
                      label: "单价",
                      value:
                        item.unitPrice != null
                          ? `$${item.unitPrice.toLocaleString()}`
                          : "-",
                    },
                    {
                      label: "毛重",
                      value:
                        item.grossWeight != null
                          ? `${item.grossWeight} kg`
                          : "-",
                    },
                  ]}
                  amount={{
                    label: "总价",
                    value:
                      item.totalPrice != null
                        ? `$${item.totalPrice.toLocaleString()}`
                        : "-",
                    emphasis: "primary",
                  }}
                  action={
                    <div className="grid grid-cols-2 gap-2">
                      <BusinessWrite>
                        <Button
                          variant="outline"
                          className="h-11"
                          aria-label={`编辑 ${name(item)}`}
                          onClick={() => onEdit(item)}
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          编辑
                        </Button>
                      </BusinessWrite>
                      <BusinessWrite>
                        <Button
                          variant="outline"
                          className="h-11 text-destructive"
                          aria-label={`删除 ${name(item)}`}
                          onClick={() => onDelete(item.id)}
                          disabled={hasShipped}
                        >
                          <Trash className="mr-1.5 h-4 w-4" />
                          删除
                        </Button>
                      </BusinessWrite>
                    </div>
                  }
                />
              ))
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {sortHead("productName", "商品名称", false)}
                {sortHead("quantity", "数量")}
                {sortHead("boxes", "箱数")}
                {sortHead("unitPrice", "单价($)")}
                {sortHead("totalPrice", "总价($)")}
                {sortHead("grossWeight", "毛重(kg)")}
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sort.sortedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {EMPTY_TEXT}
                  </TableCell>
                </TableRow>
              ) : (
                sort.sortedData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.product?.customsName || "未知商品"}
                      {(item.specification || item.product?.specification) && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({item.specification || item.product?.specification})
                        </span>
                      )}
                      {item.purchaseContractNo ? (
                        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                          来源 {item.purchaseContractNo}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.boxes ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-primary">
                      {money(item.totalPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.grossWeight || "-"}
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <BusinessWrite>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`编辑 ${name(item)}`}
                          onClick={() => onEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </BusinessWrite>
                      <BusinessWrite>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`删除 ${name(item)}`}
                          onClick={() => onDelete(item.id)}
                          disabled={hasShipped}
                        >
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      </BusinessWrite>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
});
