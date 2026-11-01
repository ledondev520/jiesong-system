/**
 * Input: GET /purchases/price-history/:productId 的 bySupplier 汇总
 * Output: 供应商比价表（桌面）/ MobileListCard 卡片（手机，最近价最低高亮）与「比价」弹层
 * Pos: 采购单行编辑器弹层、商品详情「采购价格」页签共用，只读
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import Link from "next/link";
import { Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MobileListCard } from "@/components/mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupplierPriceSummary } from "@/services/priceComparison";

const money = (value: number) => `¥${value.toLocaleString()}`;

interface SupplierPriceComparisonProps {
  rows: SupplierPriceSummary[];
  /** 提供时每行显示「用此供应商」 */
  onPick?: (row: SupplierPriceSummary) => void;
  currentSupplierId?: string;
}

export function SupplierPriceComparison({
  rows,
  onPick,
  currentSupplierId,
}: SupplierPriceComparisonProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        暂无生效合同的采购记录（草稿与已取消合同不计入）。
      </p>
    );
  }
  const lowest = Math.min(...rows.map((row) => row.lastPrice));
  return (
    <div className="space-y-2">
      {/* 手机端卡片（桌面端用下方表格） */}
      <div className="space-y-2 md:hidden" data-testid="supplier-price-cards">
        {rows.map((row) => (
          <MobileListCard
            key={row.supplierId}
            title={row.supplierName}
            subtitle={`${row.lastDate.slice(0, 10)} · ${row.lastContractNo}`}
            badge={
              (row.hasQualityIssue || row.lastPrice === lowest) && (
                <div className="flex gap-2">
                  {row.hasQualityIssue && (
                    <Badge variant="destructive">质量问题</Badge>
                  )}
                  {row.lastPrice === lowest && (
                    <Badge variant="outline">最低</Badge>
                  )}
                </div>
              )
            }
            amount={{
              label: "最近单价",
              value: money(row.lastPrice),
              emphasis: row.lastPrice === lowest ? "success" : "default",
            }}
            fields={[
              { label: "税率", value: `${row.lastTaxRate}%` },
              {
                label: "最低 / 均价",
                value: `${money(row.minPrice)} / ${money(row.averagePrice)}`,
              },
              { label: "次数", value: row.count },
            ]}
            action={
              onPick && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 w-full"
                  variant={
                    row.supplierId === currentSupplierId
                      ? "secondary"
                      : "outline"
                  }
                  onClick={() => onPick(row)}
                >
                  用此供应商
                </Button>
              )
            }
          />
        ))}
      </div>
      <div className="hidden md:block" data-testid="supplier-price-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>供应商</TableHead>
              <TableHead className="text-right">最近单价</TableHead>
              <TableHead className="text-right">税率</TableHead>
              <TableHead className="text-right">最低 / 均价</TableHead>
              <TableHead className="text-right">次数</TableHead>
              {onPick && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.supplierId}>
                <TableCell>
                  {onPick ? (
                    <span className="font-medium">{row.supplierName}</span>
                  ) : (
                    <Link
                      href={`/dashboard/suppliers/${row.supplierId}`}
                      className="font-medium hover:underline"
                    >
                      {row.supplierName}
                    </Link>
                  )}
                  {row.hasQualityIssue && (
                    <Badge variant="destructive" className="ml-2">
                      质量问题
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={
                      row.lastPrice === lowest
                        ? "font-semibold text-emerald-600"
                        : undefined
                    }
                  >
                    {money(row.lastPrice)}
                  </span>
                  {row.lastPrice === lowest && (
                    <Badge variant="outline" className="ml-2">
                      最低
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {row.lastDate.slice(0, 10)} · {row.lastContractNo}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.lastTaxRate}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.minPrice)} / {money(row.averagePrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.count}
                </TableCell>
                {onPick && (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        row.supplierId === currentSupplierId
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => onPick(row)}
                    >
                      用此供应商
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        单价为不含税价。13% 增值税发票才能办理出口退税，1% 供应商不可直接比较。
      </p>
    </div>
  );
}

/** 行编辑器内的「比价」入口；无记录时不渲染 */
export function SupplierPriceComparePopover({
  rows,
  ...rest
}: SupplierPriceComparisonProps) {
  if (rows.length === 0) return null;
  const cheapest = rows.reduce((a, b) => (b.lastPrice < a.lastPrice ? b : a));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7">
          <Scale className="mr-1 h-3 w-3" />
          比价 · 最低 {cheapest.supplierName} {money(cheapest.lastPrice)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[36rem] max-w-[90vw]">
        <SupplierPriceComparison rows={rows} {...rest} />
      </PopoverContent>
    </Popover>
  );
}
