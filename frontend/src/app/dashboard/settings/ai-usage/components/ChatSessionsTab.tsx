/**
 * Input: 可见会话列表与排序状态
 * Output: 「聊天会话」标签内容（移动卡片 + 桌面表格）
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
import { type AiSessionItem } from "@/services/ai.service";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { MobileListCard } from "@/components/mobile";
import {
  estimateCost,
  formatDomainSummary,
  formatPendingActionStatusSummary,
  formatSessionReplayLevel,
  formatTokensM,
  getGovernanceReplayProfile,
  getLatestPendingActionAt,
  getSessionAttentionSignal,
  getSessionCount,
  getSessionLastAt,
  getSessionSlaLevel,
  hasFailedPendingAction,
} from "../ai-usage-helpers";
import type { UseTableSortResult } from "@/lib/hooks/useTableSort";

export function ChatSessionsTab({
  loading,
  visibleSessions,
  sessionTableSort,
  deletingSessionId,
  handleViewDetail,
  handleDelete,
}: {
  loading: boolean;
  visibleSessions: AiSessionItem[];
  sessionTableSort: UseTableSortResult<AiSessionItem, string>;
  deletingSessionId: string | null;
  handleViewDetail: (sessionId: string) => void;
  handleDelete: (sessionId: string) => void;
}) {
  return (
    <>
      <div className="md:hidden space-y-3 p-4 pt-3">
        {loading ? (
          <div className="surface-panel py-12 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="surface-panel py-12 text-center text-sm text-muted-foreground">
            当前筛选下暂无 AI 会话记录。
          </div>
        ) : (
          sessionTableSort.sortedData.map((item) => {
            const lastAt = getSessionLastAt(item);
            const isDeleting = deletingSessionId === item.sessionId;
            const tokens = item.totalTokens ?? 0;
            const costText = estimateCost(item.lastModel ?? "", tokens) ?? "—";
            const actionStatusSummary = formatPendingActionStatusSummary(
              item.pendingActionSummary,
            );
            const latestActionAt = getLatestPendingActionAt(
              item.pendingActionSummary,
            );
            const actionHasFailed = hasFailedPendingAction(
              item.pendingActionSummary,
            );
            const sla = getSessionSlaLevel(item.pendingActionSummary);
            const attentionSignal = getSessionAttentionSignal(
              item.pendingActionSummary,
            );
            const replayLevelLabel = formatSessionReplayLevel(
              getGovernanceReplayProfile(item).level,
            );
            return (
              <MobileListCard
                key={item.sessionId}
                title={item.sessionId}
                subtitle={lastAt ? formatDateTime(lastAt) : "—"}
                badge={
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      消息 {getSessionCount(item)}
                    </Badge>
                    {sla ? (
                      <Badge variant={sla.variant}>{sla.label}</Badge>
                    ) : null}
                    {attentionSignal ? (
                      <Badge variant={attentionSignal.variant}>
                        {attentionSignal.label}
                      </Badge>
                    ) : null}
                    {replayLevelLabel ? (
                      <Badge variant="secondary">{replayLevelLabel}</Badge>
                    ) : null}
                  </div>
                }
                fields={[
                  { label: "路由", value: item.routeMode || "—" },
                  {
                    label: "域",
                    value: formatDomainSummary(item.domainsTouched),
                  },
                  {
                    label: "工具",
                    value: item.toolTraceSummary?.totalCalls
                      ? String(item.toolTraceSummary.totalCalls)
                      : "—",
                  },
                  {
                    label: "建议",
                    value: item.actionRecommendations?.length
                      ? String(item.actionRecommendations.length)
                      : "—",
                  },
                  { label: "动作", value: actionStatusSummary },
                  {
                    label: "最近动作",
                    value: latestActionAt
                      ? formatDateTime(latestActionAt)
                      : "—",
                  },
                  {
                    label: "风险",
                    value: actionHasFailed ? "失败动作" : "—",
                  },
                  {
                    label: "模型",
                    value: item.lastModel ? (
                      <span className="font-mono" title={item.lastModel}>
                        {item.lastModel.length > 24
                          ? `${item.lastModel.slice(0, 24)}…`
                          : item.lastModel}
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Token",
                    value: formatTokensM(tokens),
                    emphasis: "primary",
                  },
                  { label: "预估", value: costText },
                ]}
                onClick={() => void handleViewDetail(item.sessionId)}
                action={
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => void handleViewDetail(item.sessionId)}
                    >
                      <MessageSquare className="mr-1 h-4 w-4" />
                      查看
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => void handleDelete(item.sessionId)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-4 w-4" />
                      )}
                      删除
                    </Button>
                  </div>
                }
              />
            );
          })
        )}
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                sortKey="sessionId"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                会话ID
              </SortableTableHead>
              <SortableTableHead
                sortKey="routeMode"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                路由
              </SortableTableHead>
              <SortableTableHead
                sortKey="domains"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                工具域
              </SortableTableHead>
              <SortableTableHead
                sortKey="toolCalls"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                工具调用
              </SortableTableHead>
              <SortableTableHead
                sortKey="msgCount"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                消息数
              </SortableTableHead>
              <SortableTableHead
                sortKey="model"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                模型
              </SortableTableHead>
              <SortableTableHead
                sortKey="tokens"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                Token 消耗
              </SortableTableHead>
              <SortableTableHead
                sortKey="estCost"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                预估费用
              </SortableTableHead>
              <SortableTableHead
                sortKey="lastAt"
                currentSortKey={sessionTableSort.sortKey}
                currentSortDir={sessionTableSort.sortDir}
                onSort={sessionTableSort.onSort}
              >
                最近消息时间
              </SortableTableHead>
              <TableHead className="w-[120px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-12 text-center text-muted-foreground"
                >
                  加载中...
                </TableCell>
              </TableRow>
            ) : visibleSessions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-12 text-center text-muted-foreground"
                >
                  当前筛选下暂无 AI 会话记录。
                </TableCell>
              </TableRow>
            ) : (
              sessionTableSort.sortedData.map((item) => {
                const lastAt = getSessionLastAt(item);
                const isDeleting = deletingSessionId === item.sessionId;
                const tokens = item.totalTokens ?? 0;
                const actionStatusSummary = formatPendingActionStatusSummary(
                  item.pendingActionSummary,
                );
                const latestActionAt = getLatestPendingActionAt(
                  item.pendingActionSummary,
                );
                const actionHasFailed = hasFailedPendingAction(
                  item.pendingActionSummary,
                );
                const sla = getSessionSlaLevel(item.pendingActionSummary);
                const attentionSignal = getSessionAttentionSignal(
                  item.pendingActionSummary,
                );
                const replayLevelLabel = formatSessionReplayLevel(
                  getGovernanceReplayProfile(item).level,
                );
                return (
                  <TableRow
                    key={item.sessionId}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => void handleViewDetail(item.sessionId)}
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{item.sessionId}</span>
                        {sla ? (
                          <Badge variant={sla.variant}>{sla.label}</Badge>
                        ) : null}
                        {attentionSignal ? (
                          <Badge variant={attentionSignal.variant}>
                            {attentionSignal.label}
                          </Badge>
                        ) : null}
                        {replayLevelLabel ? (
                          <Badge variant="secondary">{replayLevelLabel}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.routeMode ? (
                        <Badge variant="secondary">{item.routeMode}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDomainSummary(item.domainsTouched)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>
                        {item.toolTraceSummary?.totalCalls
                          ? `${item.toolTraceSummary.totalCalls}${item.toolTraceSummary.failureCount ? ` / 失败 ${item.toolTraceSummary.failureCount}` : ""}`
                          : "—"}
                      </div>
                      {item.actionRecommendations?.length ? (
                        <div className="mt-1 text-[10px] text-muted-foreground/80">
                          建议 {item.actionRecommendations.length}
                        </div>
                      ) : null}
                      {item.pendingActionSummary?.length ? (
                        <div className="mt-1 text-[10px] text-muted-foreground/80">
                          {actionStatusSummary}
                        </div>
                      ) : null}
                      {latestActionAt ? (
                        <div className="mt-1 text-[10px] text-muted-foreground/80">
                          最近动作 {formatDateTime(latestActionAt)}
                        </div>
                      ) : null}
                      {actionHasFailed ? (
                        <div className="mt-1 text-[10px] text-destructive">
                          失败动作
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getSessionCount(item)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {item.lastModel ? (
                        <span
                          className="font-mono text-xs text-foreground/90"
                          title={item.lastModel}
                        >
                          {item.lastModel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-muted-foreground">
                        {formatTokensM(tokens)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {estimateCost(item.lastModel ?? "", tokens) ?? "—"}
                    </TableCell>
                    <TableCell>
                      {lastAt ? formatDateTime(lastAt) : "-"}
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl border border-border/65 bg-background/55"
                          onClick={() => void handleViewDetail(item.sessionId)}
                          aria-label={`查看会话-${item.sessionId}`}
                        >
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl border border-border/65 bg-background/55"
                          onClick={() => void handleDelete(item.sessionId)}
                          disabled={isDeleting}
                          aria-label={`删除会话-${item.sessionId}`}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
