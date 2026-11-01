/**
 * Input: AI 会话 / Token 统计 Interface 数据
 * Output: 会话治理视角、风险排序、用量图表与费用估算的纯函数及类型（含少量图标节点）
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import type {
  AiActionRecommendation,
  AiAgentToolRegistryResponse,
  AiGovernanceReplayProfile,
  AiPendingActionSummary,
  AiSessionItem,
  AiStandaloneTokenRow,
} from "@/services/ai.service";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
  routePlan?: {
    mode?: string | null;
    preferredDomains?: string[];
    selectedDomains?: string[];
  } | null;
  selectedToolNames?: string[];
  toolTraceSummary?: {
    totalCalls?: number;
    failureCount?: number;
    totalDurationMs?: number;
    items?: Array<{
      name: string;
      domain: string;
      access: string;
      status: string;
      durationMs: number;
      error?: string | null;
    }>;
  } | null;
  actionRecommendations?: AiActionRecommendation[];
  pendingActionSummary?: AiPendingActionSummary[];
  createdAt: string;
}

export interface DailyStat {
  day: string;
  model: string;
  tokens: number;
  requests: number;
  successRate: number;
}

export interface TokenStats {
  period: string;
  totalRequests: number;
  totalTokens: number;
  byModel: { model: string; requests: number; tokens: number }[];
  daily: DailyStat[];
}

export const getSessionCount = (item: AiSessionItem) => {
  if (typeof item._count === "number") return item._count;
  if (item._count && typeof item._count === "object")
    return item._count._all || 0;
  return 0;
};

export const getSessionLastAt = (item: AiSessionItem) =>
  item._max?.createdAt || null;
export const FAILED_ACTION_ESCALATION_MS = 4 * 60 * 60 * 1000;
export const PENDING_ACTION_ESCALATION_MS = 2 * 60 * 60 * 1000;
/** 超时判断参考时间的刷新间隔 */
export const NOW_TICK_MS = 30 * 1000;
export const formatDomainSummary = (domains?: string[]) => {
  if (!domains?.length) return "—";
  if (domains.length === 1) return domains[0];
  return `${domains[0]} +${domains.length - 1}`;
};

export const summarizePendingActionStatuses = (
  items?: AiPendingActionSummary[],
) => {
  const summary = {
    total: 0,
    pending: 0,
    executed: 0,
    cancelled: 0,
    failed: 0,
  };
  (items || []).forEach((item) => {
    summary.total += 1;
    if (item.status === "pending") summary.pending += 1;
    if (item.status === "executed") summary.executed += 1;
    if (item.status === "cancelled") summary.cancelled += 1;
    if (item.status === "failed") summary.failed += 1;
  });
  return summary;
};

export const formatPendingActionStatusSummary = (
  items?: AiPendingActionSummary[],
) => {
  const summary = summarizePendingActionStatuses(items);
  if (!summary.total) return "—";
  const parts = [`动作 ${summary.total}`];
  if (summary.pending) parts.push(`待确认 ${summary.pending}`);
  if (summary.executed) parts.push(`已执行 ${summary.executed}`);
  if (summary.cancelled) parts.push(`已取消 ${summary.cancelled}`);
  if (summary.failed) parts.push(`失败 ${summary.failed}`);
  return parts.join(" · ");
};

export const hasFailedPendingAction = (items?: AiPendingActionSummary[]) =>
  (items || []).some((item) => item.status === "failed");

export const getLatestPendingActionAt = (items?: AiPendingActionSummary[]) => {
  const timestamps = (items || []).flatMap((item) => {
    const timelineTimes = (item.timeline || [])
      .map((event) => event.at)
      .filter(Boolean);
    return [...timelineTimes, item.createdAt].filter(Boolean) as string[];
  });
  if (!timestamps.length) return null;
  return timestamps.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )[0];
};

export const hasPendingPendingAction = (items?: AiPendingActionSummary[]) =>
  (items || []).some((item) => item.status === "pending");

export const hasCompletedPendingAction = (items?: AiPendingActionSummary[]) => {
  const normalized = items || [];
  return (
    normalized.length > 0 &&
    normalized.every(
      (item) => item.status === "executed" || item.status === "cancelled",
    )
  );
};

export const isActionGroupAged = (
  items: AiPendingActionSummary[] | undefined,
  thresholdMs: number,
  nowMs: number,
) => {
  const latestActionAt = getLatestPendingActionAt(items);
  if (!latestActionAt) return false;
  return nowMs - new Date(latestActionAt).getTime() >= thresholdMs;
};

export const getPendingActionPriority = (
  items: AiPendingActionSummary[] | undefined,
  nowMs: number,
) => {
  if (
    hasFailedPendingAction(items) &&
    isActionGroupAged(items, FAILED_ACTION_ESCALATION_MS, nowMs)
  )
    return 0;
  if (
    hasPendingPendingAction(items) &&
    isActionGroupAged(items, PENDING_ACTION_ESCALATION_MS, nowMs)
  )
    return 1;
  if (hasFailedPendingAction(items)) return 2;
  if (hasPendingPendingAction(items)) return 3;
  if ((items || []).length > 0) return 4;
  return 5;
};

export const getSessionSlaLevel = (items?: AiPendingActionSummary[]) => {
  if (hasFailedPendingAction(items)) {
    return {
      label: "有失败动作·急",
      variant: "destructive" as const,
      emphasis: "danger" as const,
    };
  }
  if (hasPendingPendingAction(items)) {
    return {
      label: "有待确认动作",
      variant: "outline" as const,
      emphasis: "primary" as const,
    };
  }
  if ((items || []).length > 0) {
    return {
      label: "动作已完成",
      variant: "secondary" as const,
      emphasis: "success" as const,
    };
  }
  return null;
};

export const getSessionAttentionSignal = (items?: AiPendingActionSummary[]) => {
  const summary = summarizePendingActionStatuses(items);
  if (summary.failed) {
    return {
      label: "需立即处理",
      variant: "destructive" as const,
    };
  }
  if (summary.pending) {
    return {
      label: "待人工确认",
      variant: "outline" as const,
    };
  }
  if (summary.total) {
    return {
      label: "已闭环",
      variant: "secondary" as const,
    };
  }
  return null;
};

export const compareSessionRisk = (
  a: AiSessionItem,
  b: AiSessionItem,
  nowMs: number,
) => {
  const priorityDelta =
    getPendingActionPriority(a.pendingActionSummary, nowMs) -
    getPendingActionPriority(b.pendingActionSummary, nowMs);
  if (priorityDelta !== 0) return priorityDelta;

  const latestActionA = getLatestPendingActionAt(a.pendingActionSummary);
  const latestActionB = getLatestPendingActionAt(b.pendingActionSummary);
  if (latestActionA || latestActionB) {
    const actionDelta =
      new Date(latestActionB || 0).getTime() -
      new Date(latestActionA || 0).getTime();
    if (actionDelta !== 0) return actionDelta;
  }

  const lastAtA = getSessionLastAt(a);
  const lastAtB = getSessionLastAt(b);
  return new Date(lastAtB || 0).getTime() - new Date(lastAtA || 0).getTime();
};

export const compareSessionByLatestAction = (
  a: AiSessionItem,
  b: AiSessionItem,
  nowMs: number,
) => {
  const latestActionA = getLatestPendingActionAt(a.pendingActionSummary);
  const latestActionB = getLatestPendingActionAt(b.pendingActionSummary);
  const actionDelta =
    new Date(latestActionB || 0).getTime() -
    new Date(latestActionA || 0).getTime();
  if (actionDelta !== 0) return actionDelta;
  return compareSessionRisk(a, b, nowMs);
};

export const compareSessionByLatestMessage = (
  a: AiSessionItem,
  b: AiSessionItem,
  nowMs: number,
) => {
  const lastAtA = getSessionLastAt(a);
  const lastAtB = getSessionLastAt(b);
  const delta =
    new Date(lastAtB || 0).getTime() - new Date(lastAtA || 0).getTime();
  if (delta !== 0) return delta;
  return compareSessionRisk(a, b, nowMs);
};

export const compareSessionsByMode = (
  a: AiSessionItem,
  b: AiSessionItem,
  mode: string,
  nowMs: number,
) => {
  if (mode === "latest-action")
    return compareSessionByLatestAction(a, b, nowMs);
  if (mode === "latest-message")
    return compareSessionByLatestMessage(a, b, nowMs);
  return compareSessionRisk(a, b, nowMs);
};

export const matchesActionFilter = (item: AiSessionItem, filter: string) => {
  if (filter === "failed")
    return hasFailedPendingAction(item.pendingActionSummary);
  if (filter === "pending")
    return hasPendingPendingAction(item.pendingActionSummary);
  if (filter === "completed")
    return hasCompletedPendingAction(item.pendingActionSummary);
  if (filter === "actionable")
    return (
      hasFailedPendingAction(item.pendingActionSummary) ||
      hasPendingPendingAction(item.pendingActionSummary)
    );
  return true;
};

export const normalizeActionFilter = (value: string | null) =>
  ["all", "failed", "pending", "completed", "actionable"].includes(
    String(value || "").trim(),
  )
    ? String(value)
    : "all";

export const normalizeSortMode = (value: string | null) =>
  ["risk", "latest-action", "latest-message"].includes(
    String(value || "").trim(),
  )
    ? String(value)
    : "risk";

export const SESSION_LIST_PREFS_KEY = "ai-sessions-list-preferences";

export const readSessionListPreferences = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_LIST_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sort?: string; actionFilter?: string };
    return {
      sort: normalizeSortMode(parsed?.sort || null),
      actionFilter: normalizeActionFilter(parsed?.actionFilter || null),
    };
  } catch {
    return null;
  }
};

export const resolveSessionListGovernanceState = ({
  searchParams,
  stored,
  sessions,
}: {
  searchParams: URLSearchParams;
  stored: { sort: string; actionFilter: string } | null;
  sessions: AiSessionItem[];
}) => {
  if (searchParams.has("sort") || searchParams.has("actionFilter")) {
    return {
      sortMode: normalizeSortMode(searchParams.get("sort")),
      actionFilter: normalizeActionFilter(searchParams.get("actionFilter")),
      source: "url" as const,
    };
  }
  if (
    sessions.some((item) => hasFailedPendingAction(item.pendingActionSummary))
  ) {
    return {
      sortMode: "risk",
      actionFilter: "failed",
      source: "auto" as const,
    };
  }
  if (stored) {
    return {
      sortMode: stored.sort,
      actionFilter: stored.actionFilter,
      source: "local" as const,
    };
  }
  return {
    sortMode: "risk",
    actionFilter: "all",
    source: "default" as const,
  };
};

export const GOVERNANCE_PRESETS: Record<
  string,
  { actionFilter: string; sortMode: string }
> = {
  failed: { actionFilter: "failed", sortMode: "risk" },
  pending: { actionFilter: "pending", sortMode: "latest-action" },
  actionable: { actionFilter: "actionable", sortMode: "risk" },
  all: { actionFilter: "all", sortMode: "risk" },
};

export const countAgedActionSessions = ({
  sessions,
  matcher,
  thresholdMs,
  nowMs,
}: {
  sessions: AiSessionItem[];
  matcher: (items?: AiPendingActionSummary[]) => boolean;
  thresholdMs: number;
  nowMs: number;
}) =>
  sessions.filter((item) => {
    if (!matcher(item.pendingActionSummary)) return false;
    const latestActionAt = getLatestPendingActionAt(item.pendingActionSummary);
    if (!latestActionAt) return false;
    return nowMs - new Date(latestActionAt).getTime() >= thresholdMs;
  }).length;

export const buildGovernanceSummary = ({
  sessionsCount,
  failedSessionCount,
  pendingSessionCount,
  actionableSessionCount,
  agedFailedSessionCount,
  agedPendingSessionCount,
}: {
  sessionsCount: number;
  failedSessionCount: number;
  pendingSessionCount: number;
  actionableSessionCount: number;
  agedFailedSessionCount: number;
  agedPendingSessionCount: number;
}) => {
  if (!sessionsCount) return null;
  if (failedSessionCount > 0) {
    const staleFailedText =
      agedFailedSessionCount > 0
        ? `其中 ${agedFailedSessionCount} 个失败动作已超过 4 小时未处理。`
        : null;
    const stalePendingText =
      agedPendingSessionCount > 0
        ? `另有 ${agedPendingSessionCount} 个待确认会话已挂起超过 2 小时。`
        : null;
    return {
      variant: "destructive" as const,
      title: `当前有 ${failedSessionCount} 个失败动作会话需要优先处理`,
      description: [
        pendingSessionCount > 0
          ? `另有 ${pendingSessionCount} 个待确认会话仍在排队，建议先处理失败动作，再回到确认流。`
          : "失败动作会话已自动进入风险优先视角，建议先排查失败原因。",
        staleFailedText,
        stalePendingText,
      ]
        .filter(Boolean)
        .join(" "),
      actionLabel: "处理失败动作",
      preset: "failed" as const,
      Icon: AlertTriangle,
      className: "",
      agingBadges: [
        agedFailedSessionCount > 0
          ? {
              label: `超时失败 ${agedFailedSessionCount}`,
              variant: "destructive" as const,
            }
          : null,
        agedPendingSessionCount > 0
          ? {
              label: `超时待确认 ${agedPendingSessionCount}`,
              variant: "outline" as const,
            }
          : null,
      ].filter(Boolean),
    };
  }
  if (pendingSessionCount > 0) {
    return {
      variant: "default" as const,
      title: `当前有 ${pendingSessionCount} 个待确认会话等待人工确认`,
      description:
        agedPendingSessionCount > 0
          ? `其中 ${agedPendingSessionCount} 个待确认会话已挂起超过 2 小时，建议优先处理最早挂起的确认流。`
          : "这些会话已进入确认流，建议按最近动作时间逐条处理，避免长时间挂起。",
      actionLabel: "查看待确认",
      preset: "pending" as const,
      Icon: Clock3,
      className:
        "border-amber-500/40 bg-amber-50/70 text-amber-950 [&>svg]:text-amber-600 dark:bg-amber-950/20 dark:text-amber-100",
      agingBadges: [
        agedPendingSessionCount > 0
          ? {
              label: `超时待确认 ${agedPendingSessionCount}`,
              variant: "outline" as const,
            }
          : null,
      ].filter(Boolean),
    };
  }
  return {
    variant: "default" as const,
    title:
      actionableSessionCount > 0
        ? "当前待处理动作已全部收口"
        : "当前没有待处理动作会话",
    description:
      "列表仍保留完整会话回放，但当前没有失败或待确认动作需要优先介入。",
    actionLabel: "查看全部会话",
    preset: "all" as const,
    Icon: CheckCircle2,
    className:
      "border-emerald-500/40 bg-emerald-50/70 text-emerald-950 [&>svg]:text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-100",
    agingBadges: [],
  };
};

export const buildGovernanceSourceNote = ({
  prefsSource,
  actionFilter,
}: {
  prefsSource: "bootstrap" | "url" | "auto" | "local" | "default" | "manual";
  actionFilter: string;
}) => {
  if (prefsSource === "auto") {
    return {
      label: "来源：自动失败视角",
      stateLabel: "瞬时态",
      description:
        actionFilter === "failed"
          ? "检测到失败动作，系统临时切到失败优先视角。"
          : "检测到异常动作，系统临时切到自动治理视角。",
    };
  }
  if (prefsSource === "manual") {
    return {
      label: "来源：手动调整",
      stateLabel: "已手动接管",
      description: "当前治理视角由你最近一次排序或筛选操作决定。",
    };
  }
  if (prefsSource === "url") {
    return {
      label: "来源：URL 参数",
      stateLabel: "已由链接固定",
      description: "链接参数优先于本地偏好和默认视图。",
    };
  }
  if (prefsSource === "local") {
    return {
      label: "来源：本地偏好",
      stateLabel: "仅当前设备",
      description: "已恢复你上次保存的治理视角。",
    };
  }
  if (prefsSource === "default") {
    return {
      label: "来源：默认视图",
      stateLabel: "默认可复现",
      description: "当前使用系统默认的全量风险视图。",
    };
  }
  return null;
};

export const buildGovernanceViewStateNote = (
  prefsSource: "bootstrap" | "url" | "auto" | "local" | "default" | "manual",
) => {
  if (prefsSource === "url") return "当前视角：可分享";
  if (prefsSource === "local") return "当前视角：仅本机";
  if (prefsSource === "default") return "当前视角：默认基线";
  if (prefsSource === "auto") return "当前视角：临时态";
  if (prefsSource === "manual") return "当前视角：手动维护";
  return null;
};

export const getGovernanceReplayProfile = (
  item: AiSessionItem,
): AiGovernanceReplayProfile => {
  const profile = item.governanceReplayProfile;
  if (profile) return profile;
  const summary = item.governanceReplaySummary || {
    tools: Boolean(item.toolTraceSummary?.totalCalls),
    recommendations: Boolean(item.actionRecommendations?.length),
    actions: Boolean(item.pendingActionSummary?.length),
  };
  const counts = item.governanceReplayCounts || {
    tools: Number(item.toolTraceSummary?.totalCalls || 0),
    recommendations: item.actionRecommendations?.length || 0,
    actions: item.pendingActionSummary?.length || 0,
  };
  const level =
    item.governanceReplayLevel ||
    (summary.tools
      ? "tools"
      : summary.recommendations
        ? "recommendations"
        : summary.actions
          ? "actions"
          : "none");
  const available =
    item.governanceReplayAvailable ??
    (summary.tools || summary.recommendations || summary.actions);
  const source =
    item.governanceReplaySource || (available ? "session-metadata" : "none");
  const evidence = {
    operationLogEvents: (item.pendingActionSummary || []).reduce(
      (count, action) =>
        count +
        (action.timeline || []).filter((event) => event.type !== "created")
          .length,
      0,
    ),
    actionLifecycleCount: (item.pendingActionSummary || []).filter((action) =>
      (action.timeline || []).some((event) => event.type !== "created"),
    ).length,
  };

  return {
    available,
    source,
    level,
    evidence,
    counts,
    summary,
  };
};

export const formatGovernanceReplaySource = (
  source: AiGovernanceReplayProfile["source"],
) => {
  if (source === "replay-summary-record+operation-log")
    return "回放来源：回放摘要 + 操作日志";
  if (source === "replay-summary-record") return "回放来源：回放摘要";
  if (source === "replay-snapshot-log+operation-log")
    return "回放来源：回放快照 + 操作日志";
  if (source === "replay-snapshot-log") return "回放来源：回放快照";
  if (source === "agent-run-log+operation-log")
    return "回放来源：运行日志 + 操作日志";
  if (source === "agent-run-log") return "回放来源：运行日志";
  if (source === "session-metadata+operation-log")
    return "回放来源：会话元数据 + 操作日志";
  if (source === "session-metadata") return "回放来源：会话元数据";
  return null;
};

export const buildGovernanceReplayNote = (sessions: AiSessionItem[]) => {
  const replayProfiles = sessions.map(getGovernanceReplayProfile);
  const operationLogEvidenceCount = replayProfiles.reduce(
    (count, profile) => count + profile.evidence.operationLogEvents,
    0,
  );
  const hasToolsLevel = replayProfiles.some(
    (profile) => profile.level === "tools",
  );
  const hasRecommendationsLevel = replayProfiles.some(
    (profile) => profile.level === "recommendations",
  );
  const hasActionsLevel = replayProfiles.some(
    (profile) => profile.level === "actions",
  );
  const replaySource = replayProfiles.some(
    (profile) => profile.source === "replay-summary-record+operation-log",
  )
    ? "replay-summary-record+operation-log"
    : replayProfiles.some(
          (profile) => profile.source === "replay-summary-record",
        )
      ? "replay-summary-record"
      : replayProfiles.some(
            (profile) => profile.source === "replay-snapshot-log+operation-log",
          )
        ? "replay-snapshot-log+operation-log"
        : replayProfiles.some(
              (profile) => profile.source === "replay-snapshot-log",
            )
          ? "replay-snapshot-log"
          : replayProfiles.some(
                (profile) => profile.source === "agent-run-log+operation-log",
              )
            ? "agent-run-log+operation-log"
            : replayProfiles.some(
                  (profile) => profile.source === "agent-run-log",
                )
              ? "agent-run-log"
              : replayProfiles.some(
                    (profile) =>
                      profile.source === "session-metadata+operation-log",
                  )
                ? "session-metadata+operation-log"
                : replayProfiles.some(
                      (profile) => profile.source === "session-metadata",
                    )
                  ? "session-metadata"
                  : "none";
  const summary = replayProfiles.reduce(
    (acc, profile) => {
      acc.toolCount += profile.counts.tools;
      acc.recommendationCount += profile.counts.recommendations;
      acc.actionCount += profile.counts.actions;
      if (profile.summary.tools) acc.tools = true;
      if (profile.summary.recommendations) acc.recommendations = true;
      if (profile.summary.actions) acc.actions = true;
      return acc;
    },
    {
      tools: false,
      recommendations: false,
      actions: false,
      toolCount: 0,
      recommendationCount: 0,
      actionCount: 0,
    },
  );
  const hasReplaySignals =
    summary.tools || summary.recommendations || summary.actions;
  if (!hasReplaySignals) return null;
  return {
    label: "当前数据：已审计回放",
    sourceLabel: formatGovernanceReplaySource(replaySource),
    description:
      replaySource === "replay-summary-record+operation-log"
        ? "当前回放能力来自独立回放摘要与动作操作日志，可在详情中继续回放工具、建议和动作轨迹。"
        : replaySource === "replay-summary-record"
          ? "当前回放能力优先来自独立回放摘要，可在详情中继续回放工具、建议和动作轨迹。"
          : replaySource === "replay-snapshot-log+operation-log"
            ? "当前回放能力来自专用回放快照与动作操作日志，可在详情中继续回放工具、建议和动作轨迹。"
            : replaySource === "replay-snapshot-log"
              ? "当前回放能力优先来自专用回放快照，可在详情中继续回放工具、建议和动作轨迹。"
              : replaySource === "agent-run-log+operation-log"
                ? "当前回放能力来自运行日志快照与动作操作日志，可在详情中继续回放工具、建议和动作轨迹。"
                : replaySource === "agent-run-log"
                  ? "当前回放能力优先来自持久化运行日志快照，可在详情中继续回放建议和动作轨迹。"
                  : replaySource === "session-metadata+operation-log"
                    ? "当前回放能力同时来自持久化会话 metadata 和动作操作日志，可在详情中继续回放工具、建议和动作轨迹。"
                    : "当前回放能力基于持久化会话 metadata 聚合得出，可在详情中继续回放工具、建议和动作轨迹。",
    levelLabel: hasToolsLevel
      ? "回放级别：工具层"
      : hasRecommendationsLevel
        ? "回放级别：建议层"
        : hasActionsLevel
          ? "回放级别：动作层"
          : null,
    badges: [
      summary.tools ? `工具回放 ${summary.toolCount}` : null,
      summary.recommendations
        ? `建议回放 ${summary.recommendationCount}`
        : null,
      summary.actions ? `动作回放 ${summary.actionCount}` : null,
      operationLogEvidenceCount > 0
        ? `操作日志证据 ${operationLogEvidenceCount}`
        : null,
    ].filter(Boolean),
  };
};

export const formatSessionReplayLevel = (
  level?: AiSessionItem["governanceReplayLevel"],
) => {
  if (level === "tools") return "工具层回放";
  if (level === "recommendations") return "建议层回放";
  if (level === "actions") return "动作层回放";
  return null;
};

export const buildRegistryDomainStats = (
  toolRegistry: AiAgentToolRegistryResponse | null,
) => {
  if (!toolRegistry?.tools?.length) return [];
  const map = new Map<
    string,
    {
      domain: string;
      label: string;
      toolCount: number;
      compositeToolCount: number;
      description?: string;
    }
  >();
  toolRegistry.tools.forEach((tool) => {
    const current = map.get(tool.domain) || {
      domain: tool.domain,
      label: tool.domain,
      toolCount: 0,
      compositeToolCount: 0,
      description: "",
    };
    current.toolCount += 1;
    if (tool.isComposite) current.compositeToolCount += 1;
    map.set(tool.domain, current);
  });
  return Array.from(map.values()).sort(
    (a, b) => b.toolCount - a.toolCount || a.domain.localeCompare(b.domain),
  );
};

export const formatRecommendationPriority = (priority?: string) => {
  if (priority === "high") return "高优先";
  if (priority === "low") return "低优先";
  return "中优先";
};

/** 将 token 数格式化为易读单位（≥1K 用 K，≥1M 用 M） */
export const formatTokensM = (tokens: number) => {
  if (!tokens) return "—";
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)} K`;
  return `${(tokens / 1_000_000).toFixed(3)} M`;
};

/** 将每日明细转换为折线图所需格式：[{ day, model1_tokens, model2_tokens, ... }] */
export const buildChartData = (daily: DailyStat[]) => {
  const dayMap: Record<string, Record<string, number>> = {};
  const models = new Set<string>();

  for (const d of daily) {
    if (!dayMap[d.day]) dayMap[d.day] = {};
    dayMap[d.day][d.model] = d.tokens;
    models.add(d.model);
  }

  return {
    data: Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({ day, ...vals })),
    models: [...models],
  };
};

/**
 * 各模型 Token 估算单价（每千 token，人民币元）
 * 数据来源：官方定价页，仅供参考，实际费用以平台账单为准
 */
export const MODEL_PRICING_PER_K: Record<string, number> = {
  "moonshot-v1-8k": 0.012,
  "moonshot-v1-32k": 0.024,
  "moonshot-v1-128k": 0.12,
  "kimi-k2-turbo-preview": 0.012,
  "kimi-k2-thinking-turbo": 0.024,
  "kimi-k2": 0.012,
  "minimax-m2.7": 0.003,
};

/** 匹配模型每千 token 单价（元），未知模型没有估算单价 */
export const pricePerKForModel = (model: string): number | undefined => {
  const matchedKey = Object.keys(MODEL_PRICING_PER_K)
    .filter((k) => model?.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return matchedKey ? MODEL_PRICING_PER_K[matchedKey] : undefined;
};

/** 估算 token 消耗费用（人民币元），不含税 */
export const estimateCost = (model: string, tokens: number): string | null => {
  if (!tokens) return null;
  const price = pricePerKForModel(model || "");
  if (price === undefined) return "暂无价格";
  const cost = (tokens / 1000) * price;
  if (cost < 0.001) return "<¥0.001";
  return `≈¥${cost.toFixed(3)}`;
};

/** 按模型分组汇总估算费用（元） */
export const estimateSumYuan = (
  byModel: { model: string; tokens: number }[],
): number | null => {
  let sum = 0;
  for (const m of byModel) {
    if (!m.tokens) continue;
    const price = pricePerKForModel(m.model || "");
    if (price === undefined) return null;
    sum += (m.tokens / 1000) * price;
  }
  return sum;
};

export const formatYuanSum = (yuan: number | null) => {
  if (yuan === null) return "暂无价格";
  if (!yuan || yuan < 0.0001) return "≈ ¥0.00";
  return `≈ ¥${yuan.toFixed(2)}`;
};

/** 无 sessionId 的 token 记录类型展示名（与后端 requestType 对齐） */
export const REQUEST_TYPE_LABELS: Record<string, string> = {
  hs_code_recommend: "HS 编码推荐",
  parse: "辅助解析",
};

export const labelStandaloneRequestType = (t: string) =>
  REQUEST_TYPE_LABELS[t] ?? t;

/** 无会话调用列表首列：用户输入摘要（过长截断，完整内容用 title） */
export const standaloneInputLabel = (row: AiStandaloneTokenRow) => {
  const t = row.promptBrief?.trim();
  if (!t) return "—";
  return t.length > 56 ? `${t.slice(0, 56)}…` : t;
};

export type PrefsSource =
  "bootstrap" | "url" | "auto" | "local" | "default" | "manual";
