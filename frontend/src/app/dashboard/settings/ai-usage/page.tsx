import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aiService,
  type AiAgentToolRegistryResponse,
  type AiSessionItem,
  type AiStandaloneTokenRow,
} from "@/services/ai.service";
import { cachedFetch, invalidateCache } from "@/lib/api-cache";
import { runAwait } from "@/lib/run-await";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/axios";
import type { ApiResponse, PaginatedResponse } from "@/types";
import { AiToolRegistryCard } from "./components/AiToolRegistryCard";
import { AiUsageTrendCard } from "./components/AiUsageTrendCard";
import { GovernanceToolbar } from "./components/GovernanceToolbar";
import { ChatSessionsTab } from "./components/ChatSessionsTab";
import { StandaloneCallsTab } from "./components/StandaloneCallsTab";
import { StandaloneDetailDialog } from "./components/StandaloneDetailDialog";
import { SessionDetailDialog } from "./components/SessionDetailDialog";
import {
  NOW_TICK_MS,
  GOVERNANCE_PRESETS,
  SESSION_LIST_PREFS_KEY,
  readSessionListPreferences,
  resolveSessionListGovernanceState,
  matchesActionFilter,
  compareSessionsByMode,
  formatDomainSummary,
  getSessionCount,
  getSessionLastAt,
  type ChatMessage,
  type TokenStats,
} from "./ai-usage-helpers";

export default function AiSessionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<AiSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [standaloneRows, setStandaloneRows] = useState<AiStandaloneTokenRow[]>(
    [],
  );
  const [standaloneLoading, setStandaloneLoading] = useState(true);
  const [standaloneDetailRow, setStandaloneDetailRow] =
    useState<AiStandaloneTokenRow | null>(null);
  const [toolRegistry, setToolRegistry] =
    useState<AiAgentToolRegistryResponse | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<string>("risk");
  const [prefsSource, setPrefsSource] = useState<
    "bootstrap" | "url" | "auto" | "local" | "default" | "manual"
  >("bootstrap");
  const [prefsDirty, setPrefsDirty] = useState(false);

  // 会话详情弹窗
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [detailMessages, setDetailMessages] = useState<ChatMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Token 统计折线图
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [statsDays, setStatsDays] = useState<string>("7");
  // 首次渲染即处于加载中（与挂载时立即发起请求一致）
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  /** 折线图下方摘要卡片：近 24h / 近 30 天（与图表区间选择独立） */
  const [stats24h, setStats24h] = useState<TokenStats | null>(null);
  const [stats30d, setStats30d] = useState<TokenStats | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  /**
   * 超时判断（顶部摘要与风险排序共用）的参考时间：不在渲染期读取时钟；
   * 会话列表加载成功时刷新，并每 NOW_TICK_MS 定时刷新，跨过超时阈值后无需重新加载列表即可更新。
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const applyGovernancePreset = useCallback(
    (preset: keyof typeof GOVERNANCE_PRESETS) => {
      const next = GOVERNANCE_PRESETS[preset];
      setActionFilter(next.actionFilter);
      setSortMode(next.sortMode);
      setPrefsSource("manual");
      setPrefsDirty(true);
    },
    [],
  );

  /** 拉取会话列表；状态只在请求回调中更新，可直接在 effect 中调用（runAwait 与原 await 时序一致） */
  const fetchSessions = useCallback(
    () =>
      runAwait(
        () => cachedFetch("ai-sessions", () => aiService.getSessions()),
        (response) => {
          setSessions(response.data || []);
          setNowMs(Date.now());
        },
        () => {
          toast.error("加载 AI 会话失败");
        },
        () => {
          setLoading(false);
        },
      ),
    [],
  );

  const loadSessions = useCallback(() => {
    setLoading(true);
    return fetchSessions();
  }, [fetchSessions]);

  const loadStandaloneTokens = useCallback(async () => {
    setStandaloneLoading(true);
    try {
      const response = await cachedFetch("ai-standalone-tokens", () =>
        aiService.getStandaloneTokenUsage(80),
      );
      setStandaloneRows(response.data || []);
    } catch {
      toast.error("加载无会话 Token 记录失败");
    } finally {
      setStandaloneLoading(false);
    }
  }, []);

  /** 拉取 Token 统计；状态只在请求回调中更新，可直接在 effect 中调用（runAwait 与原 await 时序一致） */
  const fetchTokenStats = useCallback(
    (days: string) =>
      runAwait(
        () =>
          api.get<ApiResponse<TokenStats>, ApiResponse<TokenStats>>(
            `/ai/token-stats?days=${days}`,
          ),
        (response) => {
          setTokenStats(response.data || null);
        },
        () => {
          setStatsError(true);
        },
        () => {
          setStatsLoading(false);
        },
      ),
    [],
  );

  const loadTokenStats = useCallback(
    (days: string) => {
      setStatsLoading(true);
      setStatsError(false);
      return fetchTokenStats(days);
    },
    [fetchTokenStats],
  );

  const loadToolRegistry = useCallback(
    () =>
      runAwait(
        () =>
          cachedFetch("ai-agent-tool-registry", () =>
            aiService.getAgentToolRegistry(),
          ),
        (response) => {
          setToolRegistry(response.data ?? null);
        },
        () => {
          setToolRegistry(null);
        },
      ),
    [],
  );

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStandaloneTokens();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [loadStandaloneTokens]);

  // 统计区间变化时，在渲染期同步进入加载态（替代 effect 内同步 setState），请求仍在 effect 中发起
  const [prevStatsDays, setPrevStatsDays] = useState(statsDays);
  if (prevStatsDays !== statsDays) {
    setPrevStatsDays(statsDays);
    setStatsLoading(true);
    setStatsError(false);
  }

  useEffect(() => {
    void fetchTokenStats(statsDays);
  }, [fetchTokenStats, statsDays]);

  useEffect(() => {
    void loadToolRegistry();
  }, [loadToolRegistry]);

  // URL 参数 / 会话列表 / 加载态变化时重新解析治理视角（渲染期按输入变化调整状态，替代 effect 内 setState）
  const [governanceInputs, setGovernanceInputs] = useState({
    searchParams,
    sessions,
    loading,
  });
  if (
    governanceInputs.searchParams !== searchParams ||
    governanceInputs.sessions !== sessions ||
    governanceInputs.loading !== loading
  ) {
    setGovernanceInputs({ searchParams, sessions, loading });
    if (!loading) {
      const next = resolveSessionListGovernanceState({
        searchParams,
        stored: readSessionListPreferences(),
        sessions,
      });
      setActionFilter(next.actionFilter);
      setSortMode(next.sortMode);
      setPrefsSource(next.source);
      setPrefsDirty(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prefsSource === "bootstrap" || prefsSource === "auto") return;
    window.localStorage.setItem(
      SESSION_LIST_PREFS_KEY,
      JSON.stringify({
        sort: sortMode,
        actionFilter,
      }),
    );
  }, [sortMode, actionFilter, prefsSource]);

  useEffect(() => {
    if (prefsSource === "bootstrap") return;
    if (prefsSource === "auto") return;
    if (!prefsDirty) return;
    const params = new URLSearchParams(searchParams.toString());
    if (sortMode === "risk") {
      params.delete("sort");
    } else {
      params.set("sort", sortMode);
    }
    if (actionFilter === "all") {
      params.delete("actionFilter");
    } else {
      params.set("actionFilter", actionFilter);
    }
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [
    actionFilter,
    sortMode,
    pathname,
    router,
    searchParams,
    prefsSource,
    prefsDirty,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [r1, r30] = await Promise.all([
            api.get<ApiResponse<TokenStats>, ApiResponse<TokenStats>>(
              `/ai/token-stats?days=1`,
            ),
            api.get<ApiResponse<TokenStats>, ApiResponse<TokenStats>>(
              `/ai/token-stats?days=30`,
            ),
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
      const response = await api.get<
        ApiResponse<PaginatedResponse<ChatMessage>>,
        ApiResponse<PaginatedResponse<ChatMessage>>
      >(`/ai/history?sessionId=${encodeURIComponent(sessionId)}&pageSize=200`);
      setDetailMessages(response.data?.items || []);
    } catch {
      toast.error("加载会话详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm("确定删除该会话记录吗？")) return;
    setDeletingSessionId(sessionId);
    try {
      await aiService.deleteSession(sessionId);
      invalidateCache("ai-sessions");
      toast.success("会话已删除");
      await loadSessions();
    } catch {
      toast.error("删除会话失败");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const detailSessionRow = detailSessionId
    ? sessions.find((s) => s.sessionId === detailSessionId)
    : undefined;

  const visibleSessions = [...sessions]
    .filter((item) => matchesActionFilter(item, actionFilter))
    .sort((a, b) => compareSessionsByMode(a, b, sortMode, nowMs));

  const sessionTableSort = useTableSort<AiSessionItem, string>(
    visibleSessions,
    useCallback((item, key) => {
      switch (key) {
        case "sessionId":
          return item.sessionId;
        case "routeMode":
          return item.routeMode ?? "";
        case "domains":
          return formatDomainSummary(item.domainsTouched);
        case "toolCalls":
          return item.toolTraceSummary?.totalCalls ?? null;
        case "msgCount":
          return getSessionCount(item);
        case "model":
          return item.lastModel ?? "";
        case "tokens":
          return item.totalTokens ?? null;
        case "estCost":
          return item.totalTokens ?? null;
        case "lastAt": {
          const t = getSessionLastAt(item);
          return t ? new Date(t).getTime() : null;
        }
        default:
          return null;
      }
    }, []),
  );

  const standaloneTableSort = useTableSort<AiStandaloneTokenRow, string>(
    standaloneRows,
    useCallback((row, key) => {
      switch (key) {
        case "prompt":
          return row.promptBrief?.trim() || "";
        case "model":
          return row.model ?? "";
        case "tokens":
          return row.totalTokens ?? null;
        case "createdAt":
          return new Date(row.createdAt).getTime();
        default:
          return null;
      }
    }, []),
    { key: "createdAt", dir: "desc" },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 会话列表"
        description="用量趋势见上图；下方用标签切换「聊天会话」与「其他 AI 调用」（含 HS 编码推荐）"
        actions={
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => {
              invalidateCache("ai-sessions");
              invalidateCache("ai-standalone-tokens");
              void loadSessions();
              void loadStandaloneTokens();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        }
      />

      <AiToolRegistryCard toolRegistry={toolRegistry} />

      <AiUsageTrendCard
        tokenStats={tokenStats}
        statsDays={statsDays}
        setStatsDays={setStatsDays}
        statsLoading={statsLoading}
        statsError={statsError}
        loadTokenStats={loadTokenStats}
        stats24h={stats24h}
        stats30d={stats30d}
        summaryLoading={summaryLoading}
      />

      {/* 聊天会话 + 无 session 的 AI 调用（同一板块，Tabs 切换） */}
      <div className="space-y-2">
        <GovernanceToolbar
          sessions={sessions}
          nowMs={nowMs}
          prefsSource={prefsSource}
          actionFilter={actionFilter}
          sortMode={sortMode}
          setActionFilter={setActionFilter}
          setSortMode={setSortMode}
          setPrefsSource={setPrefsSource}
          setPrefsDirty={setPrefsDirty}
          applyGovernancePreset={applyGovernancePreset}
        />
        <div className="surface-panel overflow-hidden">
          <Tabs defaultValue="chat" className="gap-0">
            <div className="border-b border-border/60 px-4 py-3">
              <TabsList className="grid h-9 w-full max-w-md grid-cols-2">
                <TabsTrigger value="chat">聊天会话</TabsTrigger>
                <TabsTrigger value="standalone">其他 AI 调用</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chat" className="mt-0 outline-none">
              <ChatSessionsTab
                loading={loading}
                visibleSessions={visibleSessions}
                sessionTableSort={sessionTableSort}
                deletingSessionId={deletingSessionId}
                handleViewDetail={handleViewDetail}
                handleDelete={handleDelete}
              />
            </TabsContent>
            <TabsContent value="standalone" className="mt-0 outline-none">
              <StandaloneCallsTab
                standaloneRows={standaloneRows}
                standaloneLoading={standaloneLoading}
                standaloneTableSort={standaloneTableSort}
                setStandaloneDetailRow={setStandaloneDetailRow}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <StandaloneDetailDialog
        standaloneDetailRow={standaloneDetailRow}
        setStandaloneDetailRow={setStandaloneDetailRow}
      />

      <SessionDetailDialog
        detailLoading={detailLoading}
        detailMessages={detailMessages}
        detailSessionId={detailSessionId}
        detailSessionRow={detailSessionRow}
        setDetailSessionId={setDetailSessionId}
      />
    </div>
  );
}
