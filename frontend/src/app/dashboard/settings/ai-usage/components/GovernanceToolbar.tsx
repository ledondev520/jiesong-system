/**
 * Input: 会话列表与治理视角状态
 * Output: 治理预设入口条、待处理 chips 与视角说明
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AiSessionItem } from "@/services/ai.service";
import { Badge } from "@/components/ui/badge";
import {
  GOVERNANCE_PRESETS,
  hasFailedPendingAction,
  hasPendingPendingAction,
  countAgedActionSessions,
  FAILED_ACTION_ESCALATION_MS,
  PENDING_ACTION_ESCALATION_MS,
  buildGovernanceSummary,
  buildGovernanceSourceNote,
  buildGovernanceViewStateNote,
  buildGovernanceReplayNote,
  type PrefsSource,
} from "../ai-usage-helpers";

export function GovernanceToolbar({
  sessions,
  nowMs,
  prefsSource,
  actionFilter,
  sortMode,
  setActionFilter,
  setSortMode,
  setPrefsSource,
  setPrefsDirty,
  applyGovernancePreset,
}: {
  sessions: AiSessionItem[];
  nowMs: number;
  prefsSource: PrefsSource;
  actionFilter: string;
  sortMode: string;
  setActionFilter: (filter: string) => void;
  setSortMode: (mode: string) => void;
  setPrefsSource: (source: PrefsSource) => void;
  setPrefsDirty: (dirty: boolean) => void;
  applyGovernancePreset: (preset: keyof typeof GOVERNANCE_PRESETS) => void;
}) {
  const failedSessionCount = sessions.filter((item) =>
    hasFailedPendingAction(item.pendingActionSummary),
  ).length;
  const pendingSessionCount = sessions.filter((item) =>
    hasPendingPendingAction(item.pendingActionSummary),
  ).length;
  const actionableSessionCount = sessions.filter(
    (item) =>
      hasFailedPendingAction(item.pendingActionSummary) ||
      hasPendingPendingAction(item.pendingActionSummary),
  ).length;
  const agedFailedSessionCount = countAgedActionSessions({
    sessions,
    matcher: hasFailedPendingAction,
    thresholdMs: FAILED_ACTION_ESCALATION_MS,
    nowMs,
  });
  const agedPendingSessionCount = countAgedActionSessions({
    sessions,
    matcher: hasPendingPendingAction,
    thresholdMs: PENDING_ACTION_ESCALATION_MS,
    nowMs,
  });
  const governanceSummary = buildGovernanceSummary({
    sessionsCount: sessions.length,
    failedSessionCount,
    pendingSessionCount,
    actionableSessionCount,
    agedFailedSessionCount,
    agedPendingSessionCount,
  });
  const governanceSourceNote = buildGovernanceSourceNote({
    prefsSource,
    actionFilter,
  });
  const governanceViewStateNote = buildGovernanceViewStateNote(prefsSource);
  const governanceReplayNote = buildGovernanceReplayNote(sessions);
  return (
    <>
      <div
        data-testid="governance-presets"
        className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-2 rounded-xl border border-border/60 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <Button
          variant={
            actionFilter === "all" && sortMode === "risk"
              ? "default"
              : "outline"
          }
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => applyGovernancePreset("all")}
        >
          全部 {sessions.length}
        </Button>
        <Button
          variant={actionFilter === "failed" ? "default" : "outline"}
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => applyGovernancePreset("failed")}
        >
          失败动作 {failedSessionCount}
        </Button>
        <Button
          variant={actionFilter === "pending" ? "default" : "outline"}
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => applyGovernancePreset("pending")}
        >
          待确认 {pendingSessionCount}
        </Button>
        <Button
          variant={actionFilter === "actionable" ? "default" : "outline"}
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => applyGovernancePreset("actionable")}
        >
          待处理 {actionableSessionCount}
        </Button>
      </div>
      {governanceSummary ? (
        <Alert
          data-testid="sessions-governance-summary"
          variant={governanceSummary.variant}
          className={governanceSummary.className}
        >
          <governanceSummary.Icon className="h-4 w-4" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <AlertTitle>{governanceSummary.title}</AlertTitle>
              <AlertDescription>
                {governanceSummary.description}
              </AlertDescription>
              {governanceSummary.agingBadges?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {governanceSummary.agingBadges.map(
                    (badge) =>
                      badge && (
                        <Badge key={badge.label} variant={badge.variant}>
                          {badge.label}
                        </Badge>
                      ),
                  )}
                </div>
              ) : null}
            </div>
            <Button
              variant={
                governanceSummary.variant === "destructive"
                  ? "destructive"
                  : "outline"
              }
              className="h-8 shrink-0 rounded-full px-3 text-xs"
              onClick={() => applyGovernancePreset(governanceSummary.preset)}
            >
              {governanceSummary.actionLabel}
            </Button>
          </div>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">会话与用量</h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            HS 编码推荐等不产生聊天会话，请切到「其他 AI 调用」查看 Token
            与模型。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">排序方式</span>
          <Select
            value={sortMode}
            onValueChange={(value) => {
              setSortMode(value);
              setPrefsSource("manual");
              setPrefsDirty(true);
            }}
          >
            <SelectTrigger
              className="h-8 w-[150px] text-xs"
              aria-label="排序方式"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="risk">风险优先</SelectItem>
              <SelectItem value="latest-action">最近动作</SelectItem>
              <SelectItem value="latest-message">最近消息</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">动作筛选</span>
          <Select
            value={actionFilter}
            onValueChange={(value) => {
              setActionFilter(value);
              setPrefsSource("manual");
              setPrefsDirty(true);
            }}
          >
            <SelectTrigger
              className="h-8 w-[150px] text-xs"
              aria-label="动作筛选"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="failed">有失败</SelectItem>
              <SelectItem value="pending">有待确认</SelectItem>
              <SelectItem value="actionable">仅待处理</SelectItem>
              <SelectItem value="completed">已完成动作</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {sortMode === "risk" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">当前：超时优先风险排序</Badge>
          <span>顺序为超时失败、超时待确认、普通失败、普通待确认。</span>
        </div>
      ) : null}
      {governanceSourceNote ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {governanceViewStateNote ? (
            <Badge variant="outline">{governanceViewStateNote}</Badge>
          ) : null}
          <Badge variant="secondary">{governanceSourceNote.label}</Badge>
          {governanceSourceNote.stateLabel ? (
            <Badge variant="outline">{governanceSourceNote.stateLabel}</Badge>
          ) : null}
          <span>{governanceSourceNote.description}</span>
        </div>
      ) : null}
      {governanceReplayNote ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{governanceReplayNote.label}</Badge>
          {governanceReplayNote.sourceLabel ? (
            <Badge variant="outline">{governanceReplayNote.sourceLabel}</Badge>
          ) : null}
          {governanceReplayNote.levelLabel ? (
            <Badge variant="outline">{governanceReplayNote.levelLabel}</Badge>
          ) : null}
          {governanceReplayNote.badges?.map((badge) => (
            <Badge key={badge} variant="outline">
              {badge}
            </Badge>
          ))}
          <span>{governanceReplayNote.description}</span>
        </div>
      ) : null}
    </>
  );
}
