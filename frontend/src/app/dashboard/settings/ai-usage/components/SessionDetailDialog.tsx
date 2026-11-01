/**
 * Input: 会话消息与选中会话
 * Output: 会话详情弹窗
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AiSessionItem } from "@/services/ai.service";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatTime } from "@/lib/date-format";
import { stripPageContext } from "@/lib/ai-message-text";
import {
  estimateCost,
  formatDomainSummary,
  formatRecommendationPriority,
  formatTokensM,
  type ChatMessage,
} from "../ai-usage-helpers";

export function SessionDetailDialog({
  detailLoading,
  detailMessages,
  detailSessionId,
  detailSessionRow,
  setDetailSessionId,
}: {
  detailLoading: boolean;
  detailMessages: ChatMessage[];
  detailSessionId: string | null;
  detailSessionRow: AiSessionItem | undefined;
  setDetailSessionId: (sessionId: string | null) => void;
}) {
  return (
    <>
      <Dialog
        open={!!detailSessionId}
        onOpenChange={(open) => !open && setDetailSessionId(null)}
      >
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-mono text-sm truncate">
              会话详情：{detailSessionId}
            </DialogTitle>
            {detailSessionRow ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  合计 Token {formatTokensM(detailSessionRow.totalTokens ?? 0)}
                  {estimateCost(
                    detailSessionRow.lastModel ?? "",
                    detailSessionRow.totalTokens ?? 0,
                  )
                    ? ` · ${estimateCost(detailSessionRow.lastModel ?? "", detailSessionRow.totalTokens ?? 0)}`
                    : ""}
                </p>
                <p>
                  路由：{detailSessionRow.routeMode || "—"}
                  <span className="mx-2 text-border">·</span>
                  工具域：{formatDomainSummary(detailSessionRow.domainsTouched)}
                </p>
                {detailSessionRow.toolTraceSummary?.totalCalls ? (
                  <p>
                    工具调用：{detailSessionRow.toolTraceSummary.totalCalls}
                    <span className="mx-2 text-border">·</span>
                    失败：{detailSessionRow.toolTraceSummary.failureCount || 0}
                    <span className="mx-2 text-border">·</span>
                    耗时：
                    {detailSessionRow.toolTraceSummary.totalDurationMs || 0} ms
                  </p>
                ) : null}
                {detailSessionRow.actionRecommendations?.length ? (
                  <p>
                    推荐动作：{detailSessionRow.actionRecommendations.length}
                  </p>
                ) : null}
                {detailSessionRow.pendingActionSummary?.length ? (
                  <p>
                    待确认动作：{detailSessionRow.pendingActionSummary.length}
                  </p>
                ) : null}
              </div>
            ) : null}
            <DialogDescription className="sr-only">
              该会话内的历史消息列表，时间均为北京时间。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : detailMessages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无消息记录
              </p>
            ) : (
              <div className="space-y-3 py-2">
                {detailMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary/10 ml-8"
                        : "bg-muted mr-8"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {msg.role === "user"
                          ? "用户"
                          : `AI${msg.modelUsed ? ` (${msg.modelUsed})` : ""}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    {msg.routePlan?.mode ? (
                      <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                        <Badge variant="secondary">{msg.routePlan.mode}</Badge>
                        {msg.routePlan.selectedDomains?.length ? (
                          <Badge variant="outline">
                            {formatDomainSummary(msg.routePlan.selectedDomains)}
                          </Badge>
                        ) : null}
                        {msg.selectedToolNames?.length ? (
                          <Badge variant="outline">
                            tools {msg.selectedToolNames.length}
                          </Badge>
                        ) : null}
                        {msg.toolTraceSummary?.failureCount ? (
                          <Badge variant="outline">
                            fail {msg.toolTraceSummary.failureCount}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                    {msg.toolTraceSummary?.items?.length ? (
                      <div className="mb-2 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="mb-1 font-medium text-muted-foreground">
                          工具调用明细
                        </div>
                        <div className="space-y-1">
                          {msg.toolTraceSummary.items.map((item, index) => (
                            <div
                              key={`${msg.id}-${item.name}-${index}`}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <Badge
                                variant={
                                  item.status === "failed"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {item.status}
                              </Badge>
                              <span className="font-mono text-foreground/90">
                                {item.name}
                              </span>
                              <span className="text-muted-foreground">
                                {item.domain}
                              </span>
                              <span className="text-muted-foreground">
                                {item.durationMs}ms
                              </span>
                              {item.error ? (
                                <span className="text-destructive">
                                  {item.error}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {msg.actionRecommendations?.length ? (
                      <div className="mb-2 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="mb-1 font-medium text-muted-foreground">
                          推荐动作
                        </div>
                        <div className="space-y-2">
                          {msg.actionRecommendations.map((item, index) => (
                            <div
                              key={`${msg.id}-${item.code}-${index}`}
                              className="rounded-md border border-border/50 bg-muted/30 p-2"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant={
                                    item.priority === "high"
                                      ? "destructive"
                                      : "outline"
                                  }
                                >
                                  {formatRecommendationPriority(item.priority)}
                                </Badge>
                                <Badge variant="outline">
                                  {item.executionMode}
                                </Badge>
                                <span className="font-medium text-foreground/90">
                                  {item.title}
                                </span>
                                <span className="text-muted-foreground">
                                  {item.domain}
                                </span>
                              </div>
                              {item.reason ? (
                                <div className="mt-1 leading-relaxed text-muted-foreground">
                                  {item.reason}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {msg.pendingActionSummary?.length ? (
                      <div className="mb-2 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="mb-1 font-medium text-muted-foreground">
                          待确认动作
                        </div>
                        <div className="space-y-2">
                          {msg.pendingActionSummary.map((item, index) => (
                            <div
                              key={`${msg.id}-${item.actionId}-${index}`}
                              className="rounded-md border border-border/50 bg-muted/30 p-2"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant={
                                    item.status === "pending"
                                      ? "outline"
                                      : "secondary"
                                  }
                                >
                                  {item.status}
                                </Badge>
                                <span className="font-medium text-foreground/90">
                                  {item.description}
                                </span>
                                <span className="text-muted-foreground">
                                  {item.actionType}
                                </span>
                              </div>
                              {item.resultDetail ? (
                                <div className="mt-1 leading-relaxed text-muted-foreground">
                                  {item.resultDetail}
                                </div>
                              ) : null}
                              {item.timeline?.length ? (
                                <div className="mt-2 rounded-md border border-border/40 bg-background/60 p-2">
                                  <div className="mb-1 font-medium text-muted-foreground">
                                    动作时间线
                                  </div>
                                  <div className="space-y-1">
                                    {item.timeline.map((event, eventIndex) => (
                                      <div
                                        key={`${item.actionId}-${event.type}-${eventIndex}`}
                                        className="flex flex-wrap items-center gap-1.5"
                                      >
                                        <Badge
                                          variant={
                                            event.status === "pending"
                                              ? "outline"
                                              : "secondary"
                                          }
                                        >
                                          {event.type}
                                        </Badge>
                                        <span className="text-muted-foreground">
                                          {formatTime(event.at)}
                                        </span>
                                        {event.detail ? (
                                          <span className="text-muted-foreground">
                                            {event.detail}
                                          </span>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.role === "user"
                        ? stripPageContext(msg.content)
                        : msg.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
