/**
 * Input: 搜索结果列表与分页状态
 * Output: 搜索结果卡片（移动卡片、桌面表格、分页）
 * Pos: 出口模块子页面 - HSCode 检索（page.tsx 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import type { HsCodeRecord } from "@/types";
import { MobileListCard } from "@/components/mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ChevronRight } from "lucide-react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";
import type { UseTableSortResult } from "@/lib/hooks/useTableSort";
import { formatPercent, isExpiredHsCode } from "../hs-code-helpers";

export function HsCodeResultsCard({
  results,
  loading,
  isFuzzy,
  keyword,
  hsCodeInput,
  page,
  setPage,
  pageSize,
  total,
  totalPages,
  sort,
  setSelectedRecord,
}: {
  results: HsCodeRecord[];
  loading: boolean;
  isFuzzy: boolean;
  keyword: string;
  hsCodeInput: string;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: UseTableSortResult<HsCodeRecord, string>;
  setSelectedRecord: (record: HsCodeRecord | null) => void;
}) {
  return (
    <>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              搜索中...
            </div>
          ) : results.length === 0 ? (
            keyword.trim() || hsCodeInput.trim() ? (
              <div className="text-center py-8 text-muted-foreground">
                未找到相关结果，请尝试其他关键词或编码
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                当前暂无 HSCode 数据
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  共{" "}
                  <span className="font-medium text-foreground">
                    {total.toLocaleString()}
                  </span>{" "}
                  条记录，每页 {pageSize} 条，第 {page} / {totalPages} 页
                  {isFuzzy && (keyword.trim() || hsCodeInput.trim()) && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {hsCodeInput.trim() && !keyword.trim()
                        ? "编码前缀匹配"
                        : "相似度排序"}
                    </Badge>
                  )}
                </span>
              </div>

              <div className="space-y-3 md:hidden">
                {sort.sortedData.map((record) => (
                  <MobileListCard
                    key={record.id}
                    title={record.hsCode}
                    subtitle={record.productName}
                    badge={
                      isExpiredHsCode(record) ? (
                        <Badge variant="destructive">编码已失效</Badge>
                      ) : undefined
                    }
                    fields={[
                      { label: "单位", value: record.unit || "-" },
                      {
                        label: "退税率",
                        value: formatPercent(record.refundRate),
                      },
                    ]}
                    onClick={() => setSelectedRecord(record)}
                    action={
                      <div className="space-y-2">
                        <p className="break-words text-sm">
                          {record.productName}
                        </p>
                        {isFuzzy &&
                          (keyword.trim() || hsCodeInput.trim()) &&
                          record.similarity !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              置信分：{Math.round(record.similarity * 100)} 分
                            </p>
                          )}
                        <Button
                          variant="outline"
                          className="h-11 w-full"
                          onClick={() => setSelectedRecord(record)}
                        >
                          查看申报要素与详情
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        sortKey="hsCode"
                        currentSortKey={sort.sortKey}
                        currentSortDir={sort.sortDir}
                        onSort={sort.onSort}
                        className="w-[120px]"
                      >
                        HSCode
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="productName"
                        currentSortKey={sort.sortKey}
                        currentSortDir={sort.sortDir}
                        onSort={sort.onSort}
                        className="max-w-[260px]"
                      >
                        商品名称
                      </SortableTableHead>
                      {isFuzzy && (keyword.trim() || hsCodeInput.trim()) && (
                        <TableHead className="w-[76px]">置信分</TableHead>
                      )}
                      <TableHead className="w-[60px]">单位</TableHead>
                      <SortableTableHead
                        sortKey="refundRate"
                        currentSortKey={sort.sortKey}
                        currentSortDir={sort.sortDir}
                        onSort={sort.onSort}
                        className="w-[80px]"
                      >
                        退税率
                      </SortableTableHead>
                      <TableHead>申报要素</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sort.sortedData.map((record) => (
                      <TableRow
                        key={record.id}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50",
                          isExpiredHsCode(record) &&
                            "bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40",
                        )}
                        onClick={() => setSelectedRecord(record)}
                      >
                        <TableCell className="font-mono text-xs">
                          {record.hsCode}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <span
                            className="block truncate text-sm"
                            title={record.productName}
                          >
                            {record.productName}
                          </span>
                        </TableCell>
                        {isFuzzy && (keyword.trim() || hsCodeInput.trim()) && (
                          <TableCell>
                            {record.similarity !== undefined ? (
                              <Badge
                                variant={
                                  record.similarity >= 0.8
                                    ? "default"
                                    : record.similarity >= 0.5
                                      ? "secondary"
                                      : "outline"
                                }
                                className="text-xs tabular-nums"
                              >
                                {Math.round(record.similarity * 100)} 分
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-xs">
                          {record.unit || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatPercent(record.refundRate)}
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          {record.declarationElements ? (
                            <Badge
                              variant="outline"
                              className="text-xs truncate max-w-[140px] block"
                            >
                              {record.declarationElements.slice(0, 20)}
                              {record.declarationElements.length > 20
                                ? "…"
                                : ""}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 数字分页 */}
              <div className="flex flex-wrap items-center justify-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(1)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  «
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="h-8 w-8 p-0 text-xs"
                >
                  ‹
                </Button>
                {/* 显示页码窗口 */}
                {(() => {
                  const window = 5;
                  const half = Math.floor(window / 2);
                  let start = Math.max(1, page - half);
                  const end = Math.min(totalPages, start + window - 1);
                  start = Math.max(1, end - window + 1);
                  return Array.from(
                    { length: end - start + 1 },
                    (_, i) => start + i,
                  ).map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      disabled={loading}
                      onClick={() => setPage(p)}
                      className="h-8 w-8 p-0 text-xs"
                    >
                      {p}
                    </Button>
                  ));
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 w-8 p-0 text-xs"
                >
                  ›
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(totalPages)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  »
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
