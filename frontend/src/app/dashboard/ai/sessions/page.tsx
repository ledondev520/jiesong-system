/**
 * Input: AI 会话 Interface、Token 统计 Interface、独立 Token 记录 Interface（含 promptBrief）、按需图表 Module
 * Output: AI 会话管理页面（用量折线图、24h/30d 摘要卡片；聊天/独立调用与已知单价的费用估算，未知单价显示暂无价格）
 * Pos: Dashboard AI 管理模块
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, AI_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  aiService,
  type AiActionRecommendation,
  type AiAgentToolRegistryResponse,
  type AiGovernanceReplayProfile,
  type AiPendingActionSummary,
  type AiSessionItem,
  type AiStandaloneTokenRow,
} from '@/services/ai.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Trash2, MessageSquare, FileText, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { formatDateTime, formatTime } from '@/lib/date-format';
import api from '@/lib/axios';
import type { ApiResponse, PaginatedResponse } from '@/types';
import { MobileListCard } from '@/components/mobile';

const AiTokenUsageChart = lazy(() => import('./components/AiTokenUsageChart'));

const aiTokenChartFallback = (
  <div className="flex h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
    <Loader2 className="h-4 w-4 animate-spin" />
    正在加载用量图表...
  </div>
);

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
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

interface DailyStat {
  day: string;
  model: string;
  tokens: number;
  requests: number;
  successRate: number;
}

interface TokenStats {
  period: string;
  totalRequests: number;
  totalTokens: number;
  byModel: { model: string; requests: number; tokens: number }[];
  daily: DailyStat[];
}

const getSessionCount = (item: AiSessionItem) => {
  if (typeof item._count === 'number') return item._count;
  if (item._count && typeof item._count === 'object') return item._count._all || 0;
  return 0;
};

const getSessionLastAt = (item: AiSessionItem) => item._max?.createdAt || null;
const FAILED_ACTION_ESCALATION_MS = 4 * 60 * 60 * 1000;
const PENDING_ACTION_ESCALATION_MS = 2 * 60 * 60 * 1000;
const formatDomainSummary = (domains?: string[]) => {
  if (!domains?.length) return '—';
  if (domains.length === 1) return domains[0];
  return `${domains[0]} +${domains.length - 1}`;
};

const summarizePendingActionStatuses = (items?: AiPendingActionSummary[]) => {
  const summary = {
    total: 0,
    pending: 0,
    executed: 0,
    cancelled: 0,
    failed: 0,
  };
  (items || []).forEach((item) => {
    summary.total += 1;
    if (item.status === 'pending') summary.pending += 1;
    if (item.status === 'executed') summary.executed += 1;
    if (item.status === 'cancelled') summary.cancelled += 1;
    if (item.status === 'failed') summary.failed += 1;
  });
  return summary;
};

const formatPendingActionStatusSummary = (items?: AiPendingActionSummary[]) => {
  const summary = summarizePendingActionStatuses(items);
  if (!summary.total) return '—';
  const parts = [`动作 ${summary.total}`];
  if (summary.pending) parts.push(`待确认 ${summary.pending}`);
  if (summary.executed) parts.push(`已执行 ${summary.executed}`);
  if (summary.cancelled) parts.push(`已取消 ${summary.cancelled}`);
  if (summary.failed) parts.push(`失败 ${summary.failed}`);
  return parts.join(' · ');
};

const hasFailedPendingAction = (items?: AiPendingActionSummary[]) => (
  (items || []).some((item) => item.status === 'failed')
);

const getLatestPendingActionAt = (items?: AiPendingActionSummary[]) => {
  const timestamps = (items || []).flatMap((item) => {
    const timelineTimes = (item.timeline || []).map((event) => event.at).filter(Boolean);
    return [...timelineTimes, item.createdAt].filter(Boolean) as string[];
  });
  if (!timestamps.length) return null;
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
};

const hasPendingPendingAction = (items?: AiPendingActionSummary[]) => (
  (items || []).some((item) => item.status === 'pending')
);

const hasCompletedPendingAction = (items?: AiPendingActionSummary[]) => {
  const normalized = items || [];
  return normalized.length > 0
    && normalized.every((item) => item.status === 'executed' || item.status === 'cancelled');
};

const isActionGroupAged = (items: AiPendingActionSummary[] | undefined, thresholdMs: number) => {
  const latestActionAt = getLatestPendingActionAt(items);
  if (!latestActionAt) return false;
  return Date.now() - new Date(latestActionAt).getTime() >= thresholdMs;
};

const getPendingActionPriority = (items?: AiPendingActionSummary[]) => {
  if (hasFailedPendingAction(items) && isActionGroupAged(items, FAILED_ACTION_ESCALATION_MS)) return 0;
  if (hasPendingPendingAction(items) && isActionGroupAged(items, PENDING_ACTION_ESCALATION_MS)) return 1;
  if (hasFailedPendingAction(items)) return 2;
  if (hasPendingPendingAction(items)) return 3;
  if ((items || []).length > 0) return 4;
  return 5;
};

const getSessionSlaLevel = (items?: AiPendingActionSummary[]) => {
  if (hasFailedPendingAction(items)) {
    return {
      label: '有失败动作·急',
      variant: 'destructive' as const,
      emphasis: 'danger' as const,
    };
  }
  if (hasPendingPendingAction(items)) {
    return {
      label: '有待确认动作',
      variant: 'outline' as const,
      emphasis: 'primary' as const,
    };
  }
  if ((items || []).length > 0) {
    return {
      label: '动作已完成',
      variant: 'secondary' as const,
      emphasis: 'success' as const,
    };
  }
  return null;
};

const getSessionAttentionSignal = (items?: AiPendingActionSummary[]) => {
  const summary = summarizePendingActionStatuses(items);
  if (summary.failed) {
    return {
      label: '需立即处理',
      variant: 'destructive' as const,
    };
  }
  if (summary.pending) {
    return {
      label: '待人工确认',
      variant: 'outline' as const,
    };
  }
  if (summary.total) {
    return {
      label: '已闭环',
      variant: 'secondary' as const,
    };
  }
  return null;
};

const compareSessionRisk = (a: AiSessionItem, b: AiSessionItem) => {
  const priorityDelta = getPendingActionPriority(a.pendingActionSummary) - getPendingActionPriority(b.pendingActionSummary);
  if (priorityDelta !== 0) return priorityDelta;

  const latestActionA = getLatestPendingActionAt(a.pendingActionSummary);
  const latestActionB = getLatestPendingActionAt(b.pendingActionSummary);
  if (latestActionA || latestActionB) {
    const actionDelta = new Date(latestActionB || 0).getTime() - new Date(latestActionA || 0).getTime();
    if (actionDelta !== 0) return actionDelta;
  }

  const lastAtA = getSessionLastAt(a);
  const lastAtB = getSessionLastAt(b);
  return new Date(lastAtB || 0).getTime() - new Date(lastAtA || 0).getTime();
};

const compareSessionByLatestAction = (a: AiSessionItem, b: AiSessionItem) => {
  const latestActionA = getLatestPendingActionAt(a.pendingActionSummary);
  const latestActionB = getLatestPendingActionAt(b.pendingActionSummary);
  const actionDelta = new Date(latestActionB || 0).getTime() - new Date(latestActionA || 0).getTime();
  if (actionDelta !== 0) return actionDelta;
  return compareSessionRisk(a, b);
};

const compareSessionByLatestMessage = (a: AiSessionItem, b: AiSessionItem) => {
  const lastAtA = getSessionLastAt(a);
  const lastAtB = getSessionLastAt(b);
  const delta = new Date(lastAtB || 0).getTime() - new Date(lastAtA || 0).getTime();
  if (delta !== 0) return delta;
  return compareSessionRisk(a, b);
};

const compareSessionsByMode = (a: AiSessionItem, b: AiSessionItem, mode: string) => {
  if (mode === 'latest-action') return compareSessionByLatestAction(a, b);
  if (mode === 'latest-message') return compareSessionByLatestMessage(a, b);
  return compareSessionRisk(a, b);
};

const matchesActionFilter = (item: AiSessionItem, filter: string) => {
  if (filter === 'failed') return hasFailedPendingAction(item.pendingActionSummary);
  if (filter === 'pending') return hasPendingPendingAction(item.pendingActionSummary);
  if (filter === 'completed') return hasCompletedPendingAction(item.pendingActionSummary);
  if (filter === 'actionable') return hasFailedPendingAction(item.pendingActionSummary) || hasPendingPendingAction(item.pendingActionSummary);
  return true;
};

const normalizeActionFilter = (value: string | null) => (
  ['all', 'failed', 'pending', 'completed', 'actionable'].includes(String(value || '').trim()) ? String(value) : 'all'
);

const normalizeSortMode = (value: string | null) => (
  ['risk', 'latest-action', 'latest-message'].includes(String(value || '').trim()) ? String(value) : 'risk'
);

const SESSION_LIST_PREFS_KEY = 'ai-sessions-list-preferences';

const readSessionListPreferences = () => {
  if (typeof window === 'undefined') return null;
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

const resolveSessionListGovernanceState = ({
  searchParams,
  stored,
  sessions,
}: {
  searchParams: URLSearchParams;
  stored: { sort: string; actionFilter: string } | null;
  sessions: AiSessionItem[];
}) => {
  if (searchParams.has('sort') || searchParams.has('actionFilter')) {
    return {
      sortMode: normalizeSortMode(searchParams.get('sort')),
      actionFilter: normalizeActionFilter(searchParams.get('actionFilter')),
      source: 'url' as const,
    };
  }
  if (sessions.some((item) => hasFailedPendingAction(item.pendingActionSummary))) {
    return {
      sortMode: 'risk',
      actionFilter: 'failed',
      source: 'auto' as const,
    };
  }
  if (stored) {
    return {
      sortMode: stored.sort,
      actionFilter: stored.actionFilter,
      source: 'local' as const,
    };
  }
  return {
    sortMode: 'risk',
    actionFilter: 'all',
    source: 'default' as const,
  };
};

const GOVERNANCE_PRESETS: Record<string, { actionFilter: string; sortMode: string }> = {
  failed: { actionFilter: 'failed', sortMode: 'risk' },
  pending: { actionFilter: 'pending', sortMode: 'latest-action' },
  actionable: { actionFilter: 'actionable', sortMode: 'risk' },
  all: { actionFilter: 'all', sortMode: 'risk' },
};

const countAgedActionSessions = ({
  sessions,
  matcher,
  thresholdMs,
  nowMs,
}: {
  sessions: AiSessionItem[];
  matcher: (items?: AiPendingActionSummary[]) => boolean;
  thresholdMs: number;
  nowMs: number;
}) => sessions.filter((item) => {
  if (!matcher(item.pendingActionSummary)) return false;
  const latestActionAt = getLatestPendingActionAt(item.pendingActionSummary);
  if (!latestActionAt) return false;
  return nowMs - new Date(latestActionAt).getTime() >= thresholdMs;
}).length;

const buildGovernanceSummary = ({
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
    const staleFailedText = agedFailedSessionCount > 0
      ? `其中 ${agedFailedSessionCount} 个失败动作已超过 4 小时未处理。`
      : null;
    const stalePendingText = agedPendingSessionCount > 0
      ? `另有 ${agedPendingSessionCount} 个待确认会话已挂起超过 2 小时。`
      : null;
    return {
      variant: 'destructive' as const,
      title: `当前有 ${failedSessionCount} 个失败动作会话需要优先处理`,
      description: [
        pendingSessionCount > 0
          ? `另有 ${pendingSessionCount} 个待确认会话仍在排队，建议先处理失败动作，再回到确认流。`
          : '失败动作会话已自动进入风险优先视角，建议先排查失败原因。',
        staleFailedText,
        stalePendingText,
      ].filter(Boolean).join(' '),
      actionLabel: '处理失败动作',
      preset: 'failed' as const,
      Icon: AlertTriangle,
      className: '',
      agingBadges: [
        agedFailedSessionCount > 0 ? { label: `超时失败 ${agedFailedSessionCount}`, variant: 'destructive' as const } : null,
        agedPendingSessionCount > 0 ? { label: `超时待确认 ${agedPendingSessionCount}`, variant: 'outline' as const } : null,
      ].filter(Boolean),
    };
  }
  if (pendingSessionCount > 0) {
    return {
      variant: 'default' as const,
      title: `当前有 ${pendingSessionCount} 个待确认会话等待人工确认`,
      description: agedPendingSessionCount > 0
        ? `其中 ${agedPendingSessionCount} 个待确认会话已挂起超过 2 小时，建议优先处理最早挂起的确认流。`
        : '这些会话已进入确认流，建议按最近动作时间逐条处理，避免长时间挂起。',
      actionLabel: '查看待确认',
      preset: 'pending' as const,
      Icon: Clock3,
      className: 'border-amber-500/40 bg-amber-50/70 text-amber-950 [&>svg]:text-amber-600 dark:bg-amber-950/20 dark:text-amber-100',
      agingBadges: [
        agedPendingSessionCount > 0 ? { label: `超时待确认 ${agedPendingSessionCount}`, variant: 'outline' as const } : null,
      ].filter(Boolean),
    };
  }
  return {
    variant: 'default' as const,
    title: actionableSessionCount > 0 ? '当前待处理动作已全部收口' : '当前没有待处理动作会话',
    description: '列表仍保留完整会话回放，但当前没有失败或待确认动作需要优先介入。',
    actionLabel: '查看全部会话',
    preset: 'all' as const,
    Icon: CheckCircle2,
    className: 'border-emerald-500/40 bg-emerald-50/70 text-emerald-950 [&>svg]:text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-100',
    agingBadges: [],
  };
};

const buildGovernanceSourceNote = ({
  prefsSource,
  actionFilter,
}: {
  prefsSource: 'bootstrap' | 'url' | 'auto' | 'local' | 'default' | 'manual';
  actionFilter: string;
}) => {
  if (prefsSource === 'auto') {
    return {
      label: '来源：自动失败视角',
      stateLabel: '瞬时态',
      description: actionFilter === 'failed'
        ? '检测到失败动作，系统临时切到失败优先视角。'
        : '检测到异常动作，系统临时切到自动治理视角。',
    };
  }
  if (prefsSource === 'manual') {
    return {
      label: '来源：手动调整',
      stateLabel: '已手动接管',
      description: '当前治理视角由你最近一次排序或筛选操作决定。',
    };
  }
  if (prefsSource === 'url') {
    return {
      label: '来源：URL 参数',
      stateLabel: '已由链接固定',
      description: '链接参数优先于本地偏好和默认视图。',
    };
  }
  if (prefsSource === 'local') {
    return {
      label: '来源：本地偏好',
      stateLabel: '仅当前设备',
      description: '已恢复你上次保存的治理视角。',
    };
  }
  if (prefsSource === 'default') {
    return {
      label: '来源：默认视图',
      stateLabel: '默认可复现',
      description: '当前使用系统默认的全量风险视图。',
    };
  }
  return null;
};

const buildGovernanceViewStateNote = (
  prefsSource: 'bootstrap' | 'url' | 'auto' | 'local' | 'default' | 'manual'
) => {
  if (prefsSource === 'url') return '当前视角：可分享';
  if (prefsSource === 'local') return '当前视角：仅本机';
  if (prefsSource === 'default') return '当前视角：默认基线';
  if (prefsSource === 'auto') return '当前视角：临时态';
  if (prefsSource === 'manual') return '当前视角：手动维护';
  return null;
};

const getGovernanceReplayProfile = (item: AiSessionItem): AiGovernanceReplayProfile => {
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
  const level = item.governanceReplayLevel
    || (summary.tools ? 'tools' : summary.recommendations ? 'recommendations' : summary.actions ? 'actions' : 'none');
  const available = item.governanceReplayAvailable ?? (summary.tools || summary.recommendations || summary.actions);
  const source = item.governanceReplaySource || (available ? 'session-metadata' : 'none');
  const evidence = {
    operationLogEvents: (item.pendingActionSummary || []).reduce((count, action) => (
      count + ((action.timeline || []).filter((event) => event.type !== 'created').length)
    ), 0),
    actionLifecycleCount: (item.pendingActionSummary || []).filter((action) => (
      (action.timeline || []).some((event) => event.type !== 'created')
    )).length,
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

const formatGovernanceReplaySource = (source: AiGovernanceReplayProfile['source']) => {
  if (source === 'replay-summary-record+operation-log') return '回放来源：回放摘要 + 操作日志';
  if (source === 'replay-summary-record') return '回放来源：回放摘要';
  if (source === 'replay-snapshot-log+operation-log') return '回放来源：回放快照 + 操作日志';
  if (source === 'replay-snapshot-log') return '回放来源：回放快照';
  if (source === 'agent-run-log+operation-log') return '回放来源：运行日志 + 操作日志';
  if (source === 'agent-run-log') return '回放来源：运行日志';
  if (source === 'session-metadata+operation-log') return '回放来源：会话元数据 + 操作日志';
  if (source === 'session-metadata') return '回放来源：会话元数据';
  return null;
};

const buildGovernanceReplayNote = (sessions: AiSessionItem[]) => {
  const replayProfiles = sessions.map(getGovernanceReplayProfile);
  const operationLogEvidenceCount = replayProfiles.reduce((count, profile) => count + profile.evidence.operationLogEvents, 0);
  const hasToolsLevel = replayProfiles.some((profile) => profile.level === 'tools');
  const hasRecommendationsLevel = replayProfiles.some((profile) => profile.level === 'recommendations');
  const hasActionsLevel = replayProfiles.some((profile) => profile.level === 'actions');
  const replaySource = replayProfiles.some((profile) => profile.source === 'replay-summary-record+operation-log')
    ? 'replay-summary-record+operation-log'
    : replayProfiles.some((profile) => profile.source === 'replay-summary-record')
      ? 'replay-summary-record'
      : replayProfiles.some((profile) => profile.source === 'replay-snapshot-log+operation-log')
    ? 'replay-snapshot-log+operation-log'
    : replayProfiles.some((profile) => profile.source === 'replay-snapshot-log')
      ? 'replay-snapshot-log'
      : replayProfiles.some((profile) => profile.source === 'agent-run-log+operation-log')
    ? 'agent-run-log+operation-log'
    : replayProfiles.some((profile) => profile.source === 'agent-run-log')
      ? 'agent-run-log'
      : replayProfiles.some((profile) => profile.source === 'session-metadata+operation-log')
    ? 'session-metadata+operation-log'
    : replayProfiles.some((profile) => profile.source === 'session-metadata')
      ? 'session-metadata'
      : 'none';
  const summary = replayProfiles.reduce((acc, profile) => {
    acc.toolCount += profile.counts.tools;
    acc.recommendationCount += profile.counts.recommendations;
    acc.actionCount += profile.counts.actions;
    if (profile.summary.tools) acc.tools = true;
    if (profile.summary.recommendations) acc.recommendations = true;
    if (profile.summary.actions) acc.actions = true;
    return acc;
  }, { tools: false, recommendations: false, actions: false, toolCount: 0, recommendationCount: 0, actionCount: 0 });
  const hasReplaySignals = summary.tools || summary.recommendations || summary.actions;
  if (!hasReplaySignals) return null;
  return {
    label: '当前数据：已审计回放',
    sourceLabel: formatGovernanceReplaySource(replaySource),
    description: replaySource === 'replay-summary-record+operation-log'
      ? '当前回放能力来自独立回放摘要与动作操作日志，可在详情中继续回放工具、建议和动作轨迹。'
      : replaySource === 'replay-summary-record'
        ? '当前回放能力优先来自独立回放摘要，可在详情中继续回放工具、建议和动作轨迹。'
      : replaySource === 'replay-snapshot-log+operation-log'
      ? '当前回放能力来自专用回放快照与动作操作日志，可在详情中继续回放工具、建议和动作轨迹。'
      : replaySource === 'replay-snapshot-log'
        ? '当前回放能力优先来自专用回放快照，可在详情中继续回放工具、建议和动作轨迹。'
      : replaySource === 'agent-run-log+operation-log'
      ? '当前回放能力来自运行日志快照与动作操作日志，可在详情中继续回放工具、建议和动作轨迹。'
      : replaySource === 'agent-run-log'
        ? '当前回放能力优先来自持久化运行日志快照，可在详情中继续回放建议和动作轨迹。'
      : replaySource === 'session-metadata+operation-log'
      ? '当前回放能力同时来自持久化会话 metadata 和动作操作日志，可在详情中继续回放工具、建议和动作轨迹。'
      : '当前回放能力基于持久化会话 metadata 聚合得出，可在详情中继续回放工具、建议和动作轨迹。',
    levelLabel: hasToolsLevel
      ? '回放级别：工具层'
      : hasRecommendationsLevel
        ? '回放级别：建议层'
        : hasActionsLevel
          ? '回放级别：动作层'
          : null,
    badges: [
      summary.tools ? `工具回放 ${summary.toolCount}` : null,
      summary.recommendations ? `建议回放 ${summary.recommendationCount}` : null,
      summary.actions ? `动作回放 ${summary.actionCount}` : null,
      operationLogEvidenceCount > 0 ? `操作日志证据 ${operationLogEvidenceCount}` : null,
    ].filter(Boolean),
  };
};

const formatSessionReplayLevel = (level?: AiSessionItem['governanceReplayLevel']) => {
  if (level === 'tools') return '工具层回放';
  if (level === 'recommendations') return '建议层回放';
  if (level === 'actions') return '动作层回放';
  return null;
};

const buildRegistryDomainStats = (toolRegistry: AiAgentToolRegistryResponse | null) => {
  if (!toolRegistry?.tools?.length) return [];
  const map = new Map<string, {
    domain: string;
    label: string;
    toolCount: number;
    compositeToolCount: number;
    description?: string;
  }>();
  toolRegistry.tools.forEach((tool) => {
    const current = map.get(tool.domain) || {
      domain: tool.domain,
      label: tool.domain,
      toolCount: 0,
      compositeToolCount: 0,
      description: '',
    };
    current.toolCount += 1;
    if (tool.isComposite) current.compositeToolCount += 1;
    map.set(tool.domain, current);
  });
  return Array.from(map.values())
    .sort((a, b) => b.toolCount - a.toolCount || a.domain.localeCompare(b.domain));
};

const formatRecommendationPriority = (priority?: string) => {
  if (priority === 'high') return '高优先';
  if (priority === 'low') return '低优先';
  return '中优先';
};

/** 将 token 数格式化为易读单位（≥1K 用 K，≥1M 用 M） */
const formatTokensM = (tokens: number) => {
  if (!tokens) return '—';
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)} K`;
  return `${(tokens / 1_000_000).toFixed(3)} M`;
};

/** 将每日明细转换为折线图所需格式：[{ day, model1_tokens, model2_tokens, ... }] */
const buildChartData = (daily: DailyStat[]) => {
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
const MODEL_PRICING_PER_K: Record<string, number> = {
  'moonshot-v1-8k': 0.012,
  'moonshot-v1-32k': 0.024,
  'moonshot-v1-128k': 0.120,
  'kimi-k2-turbo-preview': 0.012,
  'kimi-k2-thinking-turbo': 0.024,
  'kimi-k2': 0.012,
  'minimax-m2.7': 0.003,
};

/** 匹配模型每千 token 单价（元），未知模型没有估算单价 */
const pricePerKForModel = (model: string): number | undefined => {
  const matchedKey = Object.keys(MODEL_PRICING_PER_K)
    .filter((k) => model?.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return matchedKey ? MODEL_PRICING_PER_K[matchedKey] : undefined;
};

/** 估算 token 消耗费用（人民币元），不含税 */
const estimateCost = (model: string, tokens: number): string | null => {
  if (!tokens) return null;
  const price = pricePerKForModel(model || '');
  if (price === undefined) return '暂无价格';
  const cost = (tokens / 1000) * price;
  if (cost < 0.001) return '<¥0.001';
  return `≈¥${cost.toFixed(3)}`;
};

/** 按模型分组汇总估算费用（元） */
const estimateSumYuan = (byModel: { model: string; tokens: number }[]): number | null => {
  let sum = 0;
  for (const m of byModel) {
    if (!m.tokens) continue;
    const price = pricePerKForModel(m.model || '');
    if (price === undefined) return null;
    sum += (m.tokens / 1000) * price;
  }
  return sum;
};

const formatYuanSum = (yuan: number | null) => {
  if (yuan === null) return '暂无价格';
  if (!yuan || yuan < 0.0001) return '≈ ¥0.00';
  return `≈ ¥${yuan.toFixed(2)}`;
};

/** 无 sessionId 的 token 记录类型展示名（与后端 requestType 对齐） */
const REQUEST_TYPE_LABELS: Record<string, string> = {
  hs_code_recommend: 'HS 编码推荐',
  parse: '辅助解析',
};

const labelStandaloneRequestType = (t: string) => REQUEST_TYPE_LABELS[t] ?? t;

/** 无会话调用列表首列：用户输入摘要（过长截断，完整内容用 title） */
const standaloneInputLabel = (row: AiStandaloneTokenRow) => {
  const t = row.promptBrief?.trim();
  if (!t) return '—';
  return t.length > 56 ? `${t.slice(0, 56)}…` : t;
};

export default function AiSessionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<AiSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [standaloneRows, setStandaloneRows] = useState<AiStandaloneTokenRow[]>([]);
  const [standaloneLoading, setStandaloneLoading] = useState(true);
  const [standaloneDetailRow, setStandaloneDetailRow] = useState<AiStandaloneTokenRow | null>(null);
  const [toolRegistry, setToolRegistry] = useState<AiAgentToolRegistryResponse | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<string>('risk');
  const [prefsSource, setPrefsSource] = useState<'bootstrap' | 'url' | 'auto' | 'local' | 'default' | 'manual'>('bootstrap');
  const [prefsDirty, setPrefsDirty] = useState(false);

  // 会话详情弹窗
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [detailMessages, setDetailMessages] = useState<ChatMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Token 统计折线图
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [statsDays, setStatsDays] = useState<string>('7');
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  /** 折线图下方摘要卡片：近 24h / 近 30 天（与图表区间选择独立） */
  const [stats24h, setStats24h] = useState<TokenStats | null>(null);
  const [stats30d, setStats30d] = useState<TokenStats | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const applyGovernancePreset = useCallback((preset: keyof typeof GOVERNANCE_PRESETS) => {
    const next = GOVERNANCE_PRESETS[preset];
    setActionFilter(next.actionFilter);
    setSortMode(next.sortMode);
    setPrefsSource('manual');
    setPrefsDirty(true);
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await cachedFetch('ai-sessions', () => aiService.getSessions());
      setSessions(response.data || []);
    } catch {
      toast.error('加载 AI 会话失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStandaloneTokens = useCallback(async () => {
    setStandaloneLoading(true);
    try {
      const response = await cachedFetch('ai-standalone-tokens', () => aiService.getStandaloneTokenUsage(80));
      setStandaloneRows(response.data || []);
    } catch {
      toast.error('加载无会话 Token 记录失败');
    } finally {
      setStandaloneLoading(false);
    }
  }, []);

  const loadTokenStats = useCallback(async (days: string) => {
    setStatsLoading(true);
    setStatsError(false);
    try {
      const response = await api.get<ApiResponse<TokenStats>, ApiResponse<TokenStats>>(
        `/ai/token-stats?days=${days}`
      );
      setTokenStats(response.data || null);
    } catch {
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadToolRegistry = useCallback(async () => {
    try {
      const response = await cachedFetch('ai-agent-tool-registry', () => aiService.getAgentToolRegistry());
      setToolRegistry(response.data ?? null);
    } catch {
      setToolRegistry(null);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStandaloneTokens();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [loadStandaloneTokens]);

  useEffect(() => {
    void loadTokenStats(statsDays);
  }, [loadTokenStats, statsDays]);

  useEffect(() => {
    void loadToolRegistry();
  }, [loadToolRegistry]);

  useEffect(() => {
    if (loading) return;
    const next = resolveSessionListGovernanceState({
      searchParams,
      stored: readSessionListPreferences(),
      sessions,
    });
    setActionFilter(next.actionFilter);
    setSortMode(next.sortMode);
    setPrefsSource(next.source);
    setPrefsDirty(false);
  }, [searchParams, sessions, loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (prefsSource === 'bootstrap' || prefsSource === 'auto') return;
    window.localStorage.setItem(SESSION_LIST_PREFS_KEY, JSON.stringify({
      sort: sortMode,
      actionFilter,
    }));
  }, [sortMode, actionFilter, prefsSource]);

  useEffect(() => {
    if (prefsSource === 'bootstrap') return;
    if (prefsSource === 'auto') return;
    if (!prefsDirty) return;
    const params = new URLSearchParams(searchParams.toString());
    if (sortMode === 'risk') {
      params.delete('sort');
    } else {
      params.set('sort', sortMode);
    }
    if (actionFilter === 'all') {
      params.delete('actionFilter');
    } else {
      params.set('actionFilter', actionFilter);
    }
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [actionFilter, sortMode, pathname, router, searchParams, prefsSource, prefsDirty]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
      try {
        const [r1, r30] = await Promise.all([
          api.get<ApiResponse<TokenStats>, ApiResponse<TokenStats>>(`/ai/token-stats?days=1`),
          api.get<ApiResponse<TokenStats>, ApiResponse<TokenStats>>(`/ai/token-stats?days=30`),
        ]);
        if (!cancelled) {
          setStats24h(r1.data ?? null);
          setStats30d(r30.data ?? null);
        }
      } catch {
        if (!cancelled) {
          setStats24h(null);
          setStats30d(null);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleViewDetail = async (sessionId: string) => {
    setDetailSessionId(sessionId);
    setDetailLoading(true);
    setDetailMessages([]);
    try {
      const response = await api.get<ApiResponse<PaginatedResponse<ChatMessage>>, ApiResponse<PaginatedResponse<ChatMessage>>>(
        `/ai/history?sessionId=${encodeURIComponent(sessionId)}&pageSize=200`
      );
      setDetailMessages(response.data?.items || []);
    } catch {
      toast.error('加载会话详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('确定删除该会话记录吗？')) return;
    setDeletingSessionId(sessionId);
    try {
      await aiService.deleteSession(sessionId);
      invalidateCache('ai-sessions');
      toast.success('会话已删除');
      await loadSessions();
    } catch {
      toast.error('删除会话失败');
    } finally {
      setDeletingSessionId(null);
    }
  };

  const { data: chartData, models: chartModels } = tokenStats?.daily?.length
    ? buildChartData(tokenStats.daily)
    : { data: [], models: [] };

  const detailSessionRow = detailSessionId
    ? sessions.find((s) => s.sessionId === detailSessionId)
    : undefined;

  const registryReadCount = toolRegistry?.tools?.filter((tool) => tool.access === 'read').length ?? 0;
  const registryWriteCount = toolRegistry?.tools?.filter((tool) => tool.access === 'write').length ?? 0;
  const registryDomainCount = toolRegistry?.domains?.length
    ?? (toolRegistry?.tools ? new Set(toolRegistry.tools.map((tool) => tool.domain)).size : 0);
  const registryDomainStats = toolRegistry?.domains?.length
    ? toolRegistry.domains
    : buildRegistryDomainStats(toolRegistry);
  const failedSessionCount = sessions.filter((item) => hasFailedPendingAction(item.pendingActionSummary)).length;
  const pendingSessionCount = sessions.filter((item) => hasPendingPendingAction(item.pendingActionSummary)).length;
  const actionableSessionCount = sessions.filter((item) =>
    hasFailedPendingAction(item.pendingActionSummary) || hasPendingPendingAction(item.pendingActionSummary)
  ).length;
  const nowMs = Date.now();
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
  const visibleSessions = [...sessions]
    .filter((item) => matchesActionFilter(item, actionFilter))
    .sort((a, b) => compareSessionsByMode(a, b, sortMode));

  const sessionTableSort = useTableSort<AiSessionItem, string>(
    visibleSessions,
    useCallback((item, key) => {
      switch (key) {
        case 'sessionId':
          return item.sessionId;
        case 'routeMode':
          return item.routeMode ?? '';
        case 'domains':
          return formatDomainSummary(item.domainsTouched);
        case 'toolCalls':
          return item.toolTraceSummary?.totalCalls ?? null;
        case 'msgCount':
          return getSessionCount(item);
        case 'model':
          return item.lastModel ?? '';
        case 'tokens':
          return item.totalTokens ?? null;
        case 'estCost':
          return item.totalTokens ?? null;
        case 'lastAt': {
          const t = getSessionLastAt(item);
          return t ? new Date(t).getTime() : null;
        }
        default:
          return null;
      }
    }, [])
  );

  const standaloneTableSort = useTableSort<AiStandaloneTokenRow, string>(
    standaloneRows,
    useCallback((row, key) => {
      switch (key) {
        case 'prompt':
          return row.promptBrief?.trim() || '';
        case 'model':
          return row.model ?? '';
        case 'tokens':
          return row.totalTokens ?? null;
        case 'createdAt':
          return new Date(row.createdAt).getTime();
        default:
          return null;
      }
    }, []),
    { key: 'createdAt', dir: 'desc' }
  );

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={AI_TABS} moduleName="AI 助手" />
      <PageHeader
        title="AI 会话列表"
        description="用量趋势见上图；下方用标签切换「聊天会话」与「其他 AI 调用」（含 HS 编码推荐）"
        actions={
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => {
              invalidateCache('ai-sessions');
              invalidateCache('ai-standalone-tokens');
              void loadSessions();
              void loadStandaloneTokens();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Agent 工具注册表</CardTitle>
        </CardHeader>
        <CardContent>
          {toolRegistry ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">主入口</p>
                  <p className="mt-1 font-medium">主入口 {toolRegistry.primaryAgentType}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">当前角色</p>
                  <p className="mt-1 font-medium">当前角色 {toolRegistry.viewerRole || '—'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">读工具</p>
                  <p className="mt-1 font-medium">{registryReadCount}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">写工具</p>
                  <p className="mt-1 font-medium">{registryWriteCount}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">覆盖域</p>
                  <p className="mt-1 font-medium">{registryDomainCount}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {registryDomainStats.map((item) => (
                  <Badge key={item.domain} variant="outline" className="font-mono text-[10px]">
                    {item.domain} ×{item.toolCount}{item.compositeToolCount ? ` / 复合 ${item.compositeToolCount}` : ''}
                  </Badge>
                ))}
              </div>
              {registryDomainStats.some((item) => item.description) ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {registryDomainStats
                    .filter((item) => item.description)
                    .map((item) => (
                      <div key={`${item.domain}-desc`} className="rounded-lg border p-3">
                        <p className="text-xs font-medium text-foreground">{item.label || item.domain}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">工具注册表加载失败或暂不可用。</div>
          )}
        </CardContent>
      </Card>

      {/* Token 使用折线图 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">AI 用量趋势</CardTitle>
          <Select value={statsDays} onValueChange={setStatsDays}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">近 24 小时</SelectItem>
              <SelectItem value="7">近 7 天</SelectItem>
              <SelectItem value="30">近 30 天</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </div>
          ) : statsError ? (
            <div className="flex flex-col items-center justify-center h-40 text-sm gap-2">
              <span className="text-destructive">加载失败</span>
              <button className="text-xs text-primary underline" onClick={() => void loadTokenStats(statsDays)}>重试</button>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <BarChart2 className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">暂无 Token 使用数据</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  与 AI 助手对话后，这里会显示用量趋势图
                </p>
              </div>
              <Link href="/dashboard/ai" className="text-xs text-primary hover:underline">
                前往 AI 助手对话 →
              </Link>
            </div>
          ) : (
            <Suspense fallback={aiTokenChartFallback}>
              <AiTokenUsageChart data={chartData} models={chartModels} statsDays={statsDays} />
            </Suspense>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">今日 Token（近 24 小时）</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {summaryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatTokensM(stats24h?.totalTokens ?? 0)}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">今日预计花费（近 24 小时）</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {summaryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatYuanSum(estimateSumYuan(stats24h?.byModel ?? []))}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">按公开价估算，以账单为准</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">近 30 天预计花费</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {summaryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatYuanSum(estimateSumYuan(stats30d?.byModel ?? []))}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {stats30d ? `共 ${stats30d.totalRequests} 次请求` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
          {tokenStats && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>总请求：<b className="text-foreground">{tokenStats.totalRequests}</b></span>
              <span>总消耗：<b className="text-foreground">{formatTokensM(tokenStats.totalTokens)}</b></span>
              {tokenStats.byModel.map(m => {
                const cost = estimateCost(m.model, m.tokens ?? 0);
                return (
                  <span key={m.model}>
                    {m.model}：<b className="text-foreground">{formatTokensM(m.tokens ?? 0)}</b>
                    {cost && <span className="ml-1 text-muted-foreground/60">{cost}</span>}
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 聊天会话 + 无 session 的 AI 调用（同一板块，Tabs 切换） */}
      <div className="space-y-2">
        <div
          data-testid="governance-presets"
          className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-2 rounded-xl border border-border/60 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <Button
            variant={actionFilter === 'all' && sortMode === 'risk' ? 'default' : 'outline'}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => applyGovernancePreset('all')}
          >
            全部 {sessions.length}
          </Button>
          <Button
            variant={actionFilter === 'failed' ? 'default' : 'outline'}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => applyGovernancePreset('failed')}
          >
            失败动作 {failedSessionCount}
          </Button>
          <Button
            variant={actionFilter === 'pending' ? 'default' : 'outline'}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => applyGovernancePreset('pending')}
          >
            待确认 {pendingSessionCount}
          </Button>
          <Button
            variant={actionFilter === 'actionable' ? 'default' : 'outline'}
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => applyGovernancePreset('actionable')}
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
                <AlertDescription>{governanceSummary.description}</AlertDescription>
                {governanceSummary.agingBadges?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {governanceSummary.agingBadges.map((badge) => badge && (
                      <Badge key={badge.label} variant={badge.variant}>
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button
                variant={governanceSummary.variant === 'destructive' ? 'destructive' : 'outline'}
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
              HS 编码推荐等不产生聊天会话，请切到「其他 AI 调用」查看 Token 与模型。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">排序方式</span>
            <Select value={sortMode} onValueChange={(value) => {
              setSortMode(value);
              setPrefsSource('manual');
              setPrefsDirty(true);
            }}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="排序方式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="risk">风险优先</SelectItem>
                <SelectItem value="latest-action">最近动作</SelectItem>
                <SelectItem value="latest-message">最近消息</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">动作筛选</span>
            <Select value={actionFilter} onValueChange={(value) => {
              setActionFilter(value);
              setPrefsSource('manual');
              setPrefsDirty(true);
            }}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="动作筛选">
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
        {sortMode === 'risk' ? (
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
              <Badge key={badge} variant="outline">{badge}</Badge>
            ))}
            <span>{governanceReplayNote.description}</span>
          </div>
        ) : null}
        <div className="surface-panel overflow-hidden">
          <Tabs defaultValue="chat" className="gap-0">
            <div className="border-b border-border/60 px-4 py-3">
              <TabsList className="grid h-9 w-full max-w-md grid-cols-2">
                <TabsTrigger value="chat">聊天会话</TabsTrigger>
                <TabsTrigger value="standalone">其他 AI 调用</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chat" className="mt-0 outline-none">
              <div className="md:hidden space-y-3 p-4 pt-3">
                {loading ? (
                  <div className="surface-panel py-12 text-center text-sm text-muted-foreground">加载中...</div>
                ) : visibleSessions.length === 0 ? (
                  <div className="surface-panel py-12 text-center text-sm text-muted-foreground">当前筛选下暂无 AI 会话记录。</div>
                ) : (
                  sessionTableSort.sortedData.map((item) => {
                    const lastAt = getSessionLastAt(item);
                    const isDeleting = deletingSessionId === item.sessionId;
                    const tokens = item.totalTokens ?? 0;
                    const costText = estimateCost(item.lastModel ?? '', tokens) ?? '—';
                    const actionStatusSummary = formatPendingActionStatusSummary(item.pendingActionSummary);
                    const latestActionAt = getLatestPendingActionAt(item.pendingActionSummary);
                    const actionHasFailed = hasFailedPendingAction(item.pendingActionSummary);
                    const sla = getSessionSlaLevel(item.pendingActionSummary);
                    const attentionSignal = getSessionAttentionSignal(item.pendingActionSummary);
                    const replayLevelLabel = formatSessionReplayLevel(getGovernanceReplayProfile(item).level);
                    return (
                      <MobileListCard
                        key={item.sessionId}
                        title={item.sessionId}
                        subtitle={lastAt ? formatDateTime(lastAt) : '—'}
                        badge={(
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">消息 {getSessionCount(item)}</Badge>
                            {sla ? <Badge variant={sla.variant}>{sla.label}</Badge> : null}
                            {attentionSignal ? <Badge variant={attentionSignal.variant}>{attentionSignal.label}</Badge> : null}
                            {replayLevelLabel ? <Badge variant="secondary">{replayLevelLabel}</Badge> : null}
                          </div>
                        )}
                        fields={[
                          { label: '路由', value: item.routeMode || '—' },
                          { label: '域', value: formatDomainSummary(item.domainsTouched) },
                          { label: '工具', value: item.toolTraceSummary?.totalCalls ? String(item.toolTraceSummary.totalCalls) : '—' },
                          { label: '建议', value: item.actionRecommendations?.length ? String(item.actionRecommendations.length) : '—' },
                          { label: '动作', value: actionStatusSummary },
                          { label: '最近动作', value: latestActionAt ? formatDateTime(latestActionAt) : '—' },
                          { label: '风险', value: actionHasFailed ? '失败动作' : '—' },
                          {
                            label: '模型',
                            value: item.lastModel ? (
                              <span className="font-mono" title={item.lastModel}>
                                {item.lastModel.length > 24 ? `${item.lastModel.slice(0, 24)}…` : item.lastModel}
                              </span>
                            ) : '—',
                          },
                          { label: 'Token', value: formatTokensM(tokens), emphasis: 'primary' },
                          { label: '预估', value: costText },
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
                              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
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
                        <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                      </TableRow>
                    ) : visibleSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">当前筛选下暂无 AI 会话记录。</TableCell>
                      </TableRow>
                    ) : (
                      sessionTableSort.sortedData.map((item) => {
                        const lastAt = getSessionLastAt(item);
                        const isDeleting = deletingSessionId === item.sessionId;
                        const tokens = item.totalTokens ?? 0;
                        const actionStatusSummary = formatPendingActionStatusSummary(item.pendingActionSummary);
                        const latestActionAt = getLatestPendingActionAt(item.pendingActionSummary);
                        const actionHasFailed = hasFailedPendingAction(item.pendingActionSummary);
                        const sla = getSessionSlaLevel(item.pendingActionSummary);
                        const attentionSignal = getSessionAttentionSignal(item.pendingActionSummary);
                        const replayLevelLabel = formatSessionReplayLevel(getGovernanceReplayProfile(item).level);
                        return (
                          <TableRow
                            key={item.sessionId}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => void handleViewDetail(item.sessionId)}
                          >
                            <TableCell className="font-mono text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{item.sessionId}</span>
                                {sla ? <Badge variant={sla.variant}>{sla.label}</Badge> : null}
                                {attentionSignal ? <Badge variant={attentionSignal.variant}>{attentionSignal.label}</Badge> : null}
                                {replayLevelLabel ? <Badge variant="secondary">{replayLevelLabel}</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.routeMode ? <Badge variant="secondary">{item.routeMode}</Badge> : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDomainSummary(item.domainsTouched)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <div>
                                {item.toolTraceSummary?.totalCalls
                                  ? `${item.toolTraceSummary.totalCalls}${item.toolTraceSummary.failureCount ? ` / 失败 ${item.toolTraceSummary.failureCount}` : ''}`
                                  : '—'}
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
                                <span className="font-mono text-xs text-foreground/90" title={item.lastModel}>
                                  {item.lastModel}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-mono text-xs text-muted-foreground">{formatTokensM(tokens)}</div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {estimateCost(item.lastModel ?? '', tokens) ?? '—'}
                            </TableCell>
                            <TableCell>{lastAt ? formatDateTime(lastAt) : '-'}</TableCell>
                            <TableCell>
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
                                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
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
            </TabsContent>
            <TabsContent value="standalone" className="mt-0 outline-none">
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
                              label: '模型',
                              value: (
                                <span className="font-mono" title={row.model}>
                                  {(row.model || '—').length > 20
                                    ? `${(row.model || '').slice(0, 20)}…`
                                    : row.model || '—'}
                                </span>
                              ),
                            },
                            { label: 'Token', value: formatTokensM(row.totalTokens), emphasis: 'primary' },
                            { label: '预估', value: cost ?? '—' },
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
                              <TableCell className="max-w-[200px] truncate font-mono text-xs" title={row.model}>
                                {row.model}
                              </TableCell>
                              <TableCell>
                                <div className="font-mono text-xs text-muted-foreground">{formatTokensM(row.totalTokens)}</div>
                                {cost ? <div className="mt-0.5 text-[10px] text-muted-foreground/80">{cost}</div> : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</TableCell>
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
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* 无会话 Token 行详情（含 AI 输出快照） */}
      <Dialog open={!!standaloneDetailRow} onOpenChange={(open) => !open && setStandaloneDetailRow(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base">其他 AI 调用详情</DialogTitle>
            <DialogDescription className="sr-only">
              展示该次调用的类型、模型与已保存的输出快照。
            </DialogDescription>
          </DialogHeader>
          {standaloneDetailRow ? (
            <>
              <div className="grid gap-1.5 text-xs text-muted-foreground border-b border-border/60 pb-3">
                <div>
                  <span className="text-muted-foreground/80">时间：</span>
                  {formatDateTime(standaloneDetailRow.createdAt)}
                </div>
                {standaloneDetailRow.promptBrief?.trim() ? (
                  <div>
                    <span className="text-muted-foreground/80">用户输入：</span>
                    <span className="text-foreground/90">{standaloneDetailRow.promptBrief.trim()}</span>
                  </div>
                ) : null}
                <div>
                  <span className="text-muted-foreground/80">类型：</span>
                  {labelStandaloneRequestType(standaloneDetailRow.requestType)}
                  <span className="mx-2 text-border">·</span>
                  <span className="text-muted-foreground/80">模型：</span>
                  <span className="font-mono text-foreground/90">{standaloneDetailRow.model}</span>
                </div>
                <div>
                  <span className="text-muted-foreground/80">Token：</span>
                  输入 {standaloneDetailRow.promptTokens} / 输出 {standaloneDetailRow.outputTokens} / 合计{' '}
                  {standaloneDetailRow.totalTokens}
                  {(() => {
                    const c = estimateCost(standaloneDetailRow.model, standaloneDetailRow.totalTokens);
                    return c ? <span className="ml-2 text-foreground/80">（{c}）</span> : null;
                  })()}
                </div>
              </div>
              <ScrollArea className="mt-3 max-h-[min(56vh,520px)] rounded-xl border border-border/60 bg-muted/20">
                <pre className="p-4 text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/90">
                  {standaloneDetailRow.detailSnapshot?.trim()
                    ? standaloneDetailRow.detailSnapshot
                    : '暂无保存的输出快照（可能为升级前的历史记录，或该次调用未写入正文）。'}
                </pre>
              </ScrollArea>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 会话详情弹窗 */}
      <Dialog open={!!detailSessionId} onOpenChange={(open) => !open && setDetailSessionId(null)}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-mono text-sm truncate">
              会话详情：{detailSessionId}
            </DialogTitle>
            {detailSessionRow ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  合计 Token {formatTokensM(detailSessionRow.totalTokens ?? 0)}
                  {estimateCost(detailSessionRow.lastModel ?? '', detailSessionRow.totalTokens ?? 0)
                    ? ` · ${estimateCost(detailSessionRow.lastModel ?? '', detailSessionRow.totalTokens ?? 0)}`
                    : ''}
                </p>
                <p>
                  路由：{detailSessionRow.routeMode || '—'}
                  <span className="mx-2 text-border">·</span>
                  工具域：{formatDomainSummary(detailSessionRow.domainsTouched)}
                </p>
                {detailSessionRow.toolTraceSummary?.totalCalls ? (
                  <p>
                    工具调用：{detailSessionRow.toolTraceSummary.totalCalls}
                    <span className="mx-2 text-border">·</span>
                    失败：{detailSessionRow.toolTraceSummary.failureCount || 0}
                    <span className="mx-2 text-border">·</span>
                    耗时：{detailSessionRow.toolTraceSummary.totalDurationMs || 0} ms
                  </p>
                ) : null}
                {detailSessionRow.actionRecommendations?.length ? (
                  <p>推荐动作：{detailSessionRow.actionRecommendations.length}</p>
                ) : null}
                {detailSessionRow.pendingActionSummary?.length ? (
                  <p>待确认动作：{detailSessionRow.pendingActionSummary.length}</p>
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
              <p className="py-8 text-center text-sm text-muted-foreground">暂无消息记录</p>
            ) : (
              <div className="space-y-3 py-2">
                {detailMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 text-sm ${
                      msg.role === 'user' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {msg.role === 'user' ? '用户' : `AI${msg.modelUsed ? ` (${msg.modelUsed})` : ''}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    {msg.routePlan?.mode ? (
                      <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                        <Badge variant="secondary">{msg.routePlan.mode}</Badge>
                        {msg.routePlan.selectedDomains?.length ? (
                          <Badge variant="outline">{formatDomainSummary(msg.routePlan.selectedDomains)}</Badge>
                        ) : null}
                        {msg.selectedToolNames?.length ? (
                          <Badge variant="outline">tools {msg.selectedToolNames.length}</Badge>
                        ) : null}
                        {msg.toolTraceSummary?.failureCount ? (
                          <Badge variant="outline">fail {msg.toolTraceSummary.failureCount}</Badge>
                        ) : null}
                      </div>
                    ) : null}
                    {msg.toolTraceSummary?.items?.length ? (
                      <div className="mb-2 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="mb-1 font-medium text-muted-foreground">工具调用明细</div>
                        <div className="space-y-1">
                          {msg.toolTraceSummary.items.map((item, index) => (
                            <div key={`${msg.id}-${item.name}-${index}`} className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={item.status === 'failed' ? 'destructive' : 'outline'}>{item.status}</Badge>
                              <span className="font-mono text-foreground/90">{item.name}</span>
                              <span className="text-muted-foreground">{item.domain}</span>
                              <span className="text-muted-foreground">{item.durationMs}ms</span>
                              {item.error ? <span className="text-destructive">{item.error}</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {msg.actionRecommendations?.length ? (
                      <div className="mb-2 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="mb-1 font-medium text-muted-foreground">推荐动作</div>
                        <div className="space-y-2">
                          {msg.actionRecommendations.map((item, index) => (
                            <div key={`${msg.id}-${item.code}-${index}`} className="rounded-md border border-border/50 bg-muted/30 p-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={item.priority === 'high' ? 'destructive' : 'outline'}>
                                  {formatRecommendationPriority(item.priority)}
                                </Badge>
                                <Badge variant="outline">{item.executionMode}</Badge>
                                <span className="font-medium text-foreground/90">{item.title}</span>
                                <span className="text-muted-foreground">{item.domain}</span>
                              </div>
                              {item.reason ? (
                                <div className="mt-1 leading-relaxed text-muted-foreground">{item.reason}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {msg.pendingActionSummary?.length ? (
                      <div className="mb-2 rounded-md border border-border/60 bg-background/60 p-2 text-[10px]">
                        <div className="mb-1 font-medium text-muted-foreground">待确认动作</div>
                        <div className="space-y-2">
                          {msg.pendingActionSummary.map((item, index) => (
                            <div key={`${msg.id}-${item.actionId}-${index}`} className="rounded-md border border-border/50 bg-muted/30 p-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={item.status === 'pending' ? 'outline' : 'secondary'}>{item.status}</Badge>
                                <span className="font-medium text-foreground/90">{item.description}</span>
                                <span className="text-muted-foreground">{item.actionType}</span>
                              </div>
                              {item.resultDetail ? (
                                <div className="mt-1 leading-relaxed text-muted-foreground">{item.resultDetail}</div>
                              ) : null}
                              {item.timeline?.length ? (
                                <div className="mt-2 rounded-md border border-border/40 bg-background/60 p-2">
                                  <div className="mb-1 font-medium text-muted-foreground">动作时间线</div>
                                  <div className="space-y-1">
                                    {item.timeline.map((event, eventIndex) => (
                                      <div key={`${item.actionId}-${event.type}-${eventIndex}`} className="flex flex-wrap items-center gap-1.5">
                                        <Badge variant={event.status === 'pending' ? 'outline' : 'secondary'}>{event.type}</Badge>
                                        <span className="text-muted-foreground">{formatTime(event.at)}</span>
                                        {event.detail ? <span className="text-muted-foreground">{event.detail}</span> : null}
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
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
