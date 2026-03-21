/**
 * Input: AI 会话 API、Token 统计 API
 * Output: AI 会话管理页面（含 token 折线图）
 * Pos: Dashboard AI 管理模块
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, AI_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { aiService, type AiSessionItem } from '@/services/ai.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '@/lib/axios';
import type { ApiResponse, PaginatedResponse } from '@/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

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

/** 将 token 数格式化为 M（百万）显示 */
const formatTokensM = (tokens: number) => {
  if (!tokens) return '—';
  if (tokens < 1000) return `${tokens} T`;
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

/**
 * 各模型 Token 估算单价（每千 token，人民币元）
 * 数据来源：官方定价页，仅供参考，实际费用以平台账单为准
 */
const MODEL_PRICING_PER_K: Record<string, number> = {
  'moonshot-v1-8k': 0.012,
  'moonshot-v1-32k': 0.024,
  'moonshot-v1-128k': 0.120,
  'minimax-m2.7': 0.003,
};

/** 估算 token 消耗费用（人民币元），不含税 */
const estimateCost = (model: string, tokens: number): string | null => {
  // 按前缀匹配，找到最具体的定价规则
  const matchedKey = Object.keys(MODEL_PRICING_PER_K)
    .filter((k) => model?.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!matchedKey || !tokens) return null;
  const cost = (tokens / 1000) * MODEL_PRICING_PER_K[matchedKey];
  if (cost < 0.001) return '<¥0.001';
  return `≈¥${cost.toFixed(3)}`;
};

export default function AiSessionsPage() {
  const [sessions, setSessions] = useState<AiSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // 会话详情弹窗
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [detailMessages, setDetailMessages] = useState<ChatMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Token 统计折线图
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [statsDays, setStatsDays] = useState<string>('30');
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);

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
    void loadTokenStats(statsDays);
  }, [loadTokenStats, statsDays]);

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

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={AI_TABS} moduleName="AI 助手" />
      <PageHeader
        title="AI 会话列表"
        description="查看历史会话与消息规模，支持清理无效会话"
        actions={
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => void loadSessions()}>
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
              <SelectItem value="7">近 7 天</SelectItem>
              <SelectItem value="30">近 30 天</SelectItem>
              <SelectItem value="90">近 90 天</SelectItem>
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
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              暂无 Token 使用数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatTokensM(value), name]}
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

      {/* 会话列表 */}
      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>会话ID</TableHead>
              <TableHead>消息数</TableHead>
              <TableHead>Token 消耗</TableHead>
              <TableHead>最近消息时间</TableHead>
              <TableHead className="w-[120px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
              </TableRow>
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">暂无 AI 会话记录。</TableCell>
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
                    <TableCell>
                      <div className="font-mono text-xs text-muted-foreground">{formatTokensM(tokens)}</div>
                      {(() => {
                        const cost = estimateCost(item.lastModel ?? '', tokens);
                        return cost ? (
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">{cost}</div>
                        ) : null;
                      })()}
                    </TableCell>
                    <TableCell>{lastAt ? format(new Date(lastAt), 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
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

      {/* 会话详情弹窗 */}
      <Dialog open={!!detailSessionId} onOpenChange={(open) => !open && setDetailSessionId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm truncate">
              会话详情：{detailSessionId}
            </DialogTitle>
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
                        {format(new Date(msg.createdAt), 'HH:mm:ss')}
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
