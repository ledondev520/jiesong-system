/**
 * Input: AI 会话 API、Token 统计 API、独立 Token 记录 API（含 promptBrief）
 * Output: AI 会话管理页面（用量折线图、24h/30d 摘要卡片；聊天会话 / 其他 AI 调用 Tabs 与费用展示）
 * Pos: Dashboard AI 管理模块
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { aiService, type AiSessionItem, type AiStandaloneTokenRow } from '@/services/ai.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2, MessageSquare, FileText, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatDateTime, formatTime } from '@/lib/date-format';
import api from '@/lib/axios';
import type { ApiResponse, PaginatedResponse } from '@/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { MobileListCard } from '@/components/mobile';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
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

const MODEL_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6',
];

/** 后端按北京时间（UTC+8）整点分桶返回的 yyyy-MM-dd HH:00 */
const SHANGHAI_HOUR_BUCKET = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/;

/** 职责：将北京时间分桶字符串解析为 Date（固定 +08:00，与浏览器本地时区无关） */
const parseShanghaiHourBucket = (value: string): Date | null => {
  const m = value.match(SHANGHAI_HOUR_BUCKET);
  if (!m) return null;
  return new Date(`${m[1]}T${m[2]}:00:00+08:00`);
};

/** 职责：折线图横轴刻度——近 24 小时为北京时间「时:分」，其它区间为「月/日」 */
const formatChartXTick = (value: string, statsDays: string) => {
  if (statsDays === '1') {
    const d = parseShanghaiHourBucket(value);
    if (d) return format(d, 'HH:mm');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      return format(new Date(`${value}T12:00:00+08:00`), 'M/d');
    } catch {
      return value;
    }
  }
  return value;
};

/** 职责：Tooltip 横轴标签：24 小时为整点；按日区间为北京日历日 */
const formatChartTooltipLabel = (value: string, statsDays: string) => {
  if (statsDays === '1') {
    const d = parseShanghaiHourBucket(value);
    if (d) return `${format(d, 'M/d HH:mm')}（北京时间）`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try {
      const d = new Date(`${value}T12:00:00+08:00`);
      return `${format(d, 'yyyy-MM-dd')}（北京时间·按日）`;
    } catch {
      return value;
    }
  }
  return value;
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

const DEFAULT_PRICE_PER_K = 0.012;

/** 匹配模型每千 token 单价（元），无规则时用默认 */
const pricePerKForModel = (model: string): number => {
  const matchedKey = Object.keys(MODEL_PRICING_PER_K)
    .filter((k) => model?.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return matchedKey ? MODEL_PRICING_PER_K[matchedKey] : DEFAULT_PRICE_PER_K;
};

/** 估算 token 消耗费用（人民币元），不含税 */
const estimateCost = (model: string, tokens: number): string | null => {
  if (!tokens) return null;
  const cost = (tokens / 1000) * pricePerKForModel(model || '');
  if (cost < 0.001) return '<¥0.001';
  return `≈¥${cost.toFixed(3)}`;
};

/** 按模型分组汇总估算费用（元） */
const estimateSumYuan = (byModel: { model: string; tokens: number }[]): number => {
  return byModel.reduce((sum, m) => {
    if (!m.tokens) return sum;
    return sum + (m.tokens / 1000) * pricePerKForModel(m.model || '');
  }, 0);
};

const formatYuanSum = (yuan: number) => {
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
  const [sessions, setSessions] = useState<AiSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [standaloneRows, setStandaloneRows] = useState<AiStandaloneTokenRow[]>([]);
  const [standaloneLoading, setStandaloneLoading] = useState(true);
  const [standaloneDetailRow, setStandaloneDetailRow] = useState<AiStandaloneTokenRow | null>(null);

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

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadStandaloneTokens();
  }, [loadStandaloneTokens]);

  useEffect(() => {
    void loadTokenStats(statsDays);
  }, [loadTokenStats, statsDays]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
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
    return () => {
      cancelled = true;
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

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
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
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  minTickGap={statsDays === '1' ? 16 : 8}
                  tickFormatter={(v: string) => formatChartXTick(v, statsDays)}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <Tooltip
                  labelFormatter={(label) => formatChartTooltipLabel(String(label), statsDays)}
                  formatter={(value, name) => [
                    formatTokensM(typeof value === 'number' ? value : Number(value ?? 0)),
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartModels.map((model, i) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    name={model}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
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
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-sm font-medium text-foreground">会话与用量</h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            HS 编码推荐等不产生聊天会话，请切到「其他 AI 调用」查看 Token 与模型。
          </p>
        </div>
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
                ) : sessions.length === 0 ? (
                  <div className="surface-panel py-12 text-center text-sm text-muted-foreground">暂无 AI 会话记录。</div>
                ) : (
                  sessions.map((item) => {
                    const lastAt = getSessionLastAt(item);
                    const isDeleting = deletingSessionId === item.sessionId;
                    const tokens = item.totalTokens ?? 0;
                    const costText = estimateCost(item.lastModel ?? '', tokens) ?? '—';
                    return (
                      <MobileListCard
                        key={item.sessionId}
                        title={item.sessionId}
                        subtitle={lastAt ? formatDateTime(lastAt) : '—'}
                        badge={<Badge variant="outline">消息 {getSessionCount(item)}</Badge>}
                        fields={[
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
                      <TableHead>会话ID</TableHead>
                      <TableHead>消息数</TableHead>
                      <TableHead>模型</TableHead>
                      <TableHead>Token 消耗</TableHead>
                      <TableHead>预估费用</TableHead>
                      <TableHead>最近消息时间</TableHead>
                      <TableHead className="w-[120px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                      </TableRow>
                    ) : sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">暂无 AI 会话记录。</TableCell>
                      </TableRow>
                    ) : (
                      sessions.map((item) => {
                        const lastAt = getSessionLastAt(item);
                        const isDeleting = deletingSessionId === item.sessionId;
                        const tokens = item.totalTokens ?? 0;
                        return (
                          <TableRow
                            key={item.sessionId}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => void handleViewDetail(item.sessionId)}
                          >
                            <TableCell className="font-mono text-xs">{item.sessionId}</TableCell>
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
                    {standaloneRows.map((row) => {
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
                          <TableHead className="min-w-[140px] max-w-[240px]">用户输入摘要</TableHead>
                          <TableHead>类型</TableHead>
                          <TableHead>模型</TableHead>
                          <TableHead className="min-w-[100px]">Token / 预估费用</TableHead>
                          <TableHead>时间</TableHead>
                          <TableHead className="w-[100px] text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {standaloneRows.map((row) => {
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
              <p className="text-xs text-muted-foreground">
                合计 Token {formatTokensM(detailSessionRow.totalTokens ?? 0)}
                {estimateCost(detailSessionRow.lastModel ?? '', detailSessionRow.totalTokens ?? 0)
                  ? ` · ${estimateCost(detailSessionRow.lastModel ?? '', detailSessionRow.totalTokens ?? 0)}`
                  : ''}
              </p>
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
