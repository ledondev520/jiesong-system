/**
 * Input: 无会话 Token 记录与排序状态
 * Output: 「其他 AI 调用」标签内容
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { type AiStandaloneTokenRow } from "@/services/ai.service";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { MobileListCard } from "@/components/mobile";
import {
  estimateCost,
  formatTokensM,
  labelStandaloneRequestType,
  standaloneInputLabel,
} from "../ai-usage-helpers";
import type { UseTableSortResult } from "@/lib/hooks/useTableSort";

export function StandaloneCallsTab({
  standaloneRows,
  standaloneLoading,
  standaloneTableSort,
  setStandaloneDetailRow,
}: {
  standaloneRows: AiStandaloneTokenRow[];
  standaloneLoading: boolean;
  standaloneTableSort: UseTableSortResult<AiStandaloneTokenRow, string>;
  setStandaloneDetailRow: (row: AiStandaloneTokenRow) => void;
}) {
  return (
    <>
      <p className="text-xs text-muted-foreground px-4 pt-3 pb-2 border-b border-border/40">
        含 HS 编码推荐、辅助解析等；无聊天 session，仅记录 Token 用量。
      </p>
      {standaloneLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : standaloneRows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground px-4">
          暂无记录。在 HS 编码页使用 AI 推荐后，将显示在此标签。
        </p>
      ) : (
        <>
          <div className="md:hidden space-y-3 p-4 pt-3">
            {standaloneTableSort.sortedData.map((row) => {
              const cost = estimateCost(row.model, row.totalTokens);
              return (
                <MobileListCard
                  key={row.id}
                  title={standaloneInputLabel(row)}
                  subtitle={formatDateTime(row.createdAt)}
                  badge={
                    <Badge variant="secondary" className="font-normal">
                      {labelStandaloneRequestType(row.requestType)}
                    </Badge>
                  }
                  fields={[
                    {
                      label: "模型",
                      value: (
                        <span className="font-mono" title={row.model}>
                          {(row.model || "—").length > 20
                            ? `${(row.model || "").slice(0, 20)}…`
                            : row.model || "—"}
                        </span>
                      ),
                    },
                    {
                      label: "Token",
                      value: formatTokensM(row.totalTokens),
                      emphasis: "primary",
                    },
                    { label: "预估", value: cost ?? "—" },
                  ]}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => setStandaloneDetailRow(row)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      详情
                    </Button>
                  }
                />
              );
            })}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="prompt"
                    currentSortKey={standaloneTableSort.sortKey}
                    currentSortDir={standaloneTableSort.sortDir}
                    onSort={standaloneTableSort.onSort}
                    className="min-w-[140px] max-w-[240px]"
                  >
                    用户输入摘要
                  </SortableTableHead>
                  <TableHead>类型</TableHead>
                  <SortableTableHead
                    sortKey="model"
                    currentSortKey={standaloneTableSort.sortKey}
                    currentSortDir={standaloneTableSort.sortDir}
                    onSort={standaloneTableSort.onSort}
                  >
                    模型
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="tokens"
                    currentSortKey={standaloneTableSort.sortKey}
                    currentSortDir={standaloneTableSort.sortDir}
                    onSort={standaloneTableSort.onSort}
                    className="min-w-[100px]"
                  >
                    Token / 预估费用
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="createdAt"
                    currentSortKey={standaloneTableSort.sortKey}
                    currentSortDir={standaloneTableSort.sortDir}
                    onSort={standaloneTableSort.onSort}
                  >
                    时间
                  </SortableTableHead>
                  <TableHead className="w-[100px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standaloneTableSort.sortedData.map((row) => {
                  const cost = estimateCost(row.model, row.totalTokens);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[240px]">
                        <span
                          className="line-clamp-2 text-xs leading-snug text-foreground/90"
                          title={row.promptBrief?.trim() || undefined}
                        >
                          {standaloneInputLabel(row)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {labelStandaloneRequestType(row.requestType)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate font-mono text-xs"
                        title={row.model}
                      >
                        {row.model}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs text-muted-foreground">
                          {formatTokensM(row.totalTokens)}
                        </div>
                        {cost ? (
                          <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                            {cost}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg gap-1.5"
                          onClick={() => setStandaloneDetailRow(row)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
