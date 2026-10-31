/**
 * Input: Token 统计数据、区间选择
 * Output: AI 用量趋势折线图与 24h/30d 摘要卡片（图表 Module 按需加载）
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, BarChart2 } from "lucide-react";
import Link from "next/link";
import {
  buildChartData,
  estimateCost,
  estimateSumYuan,
  formatTokensM,
  formatYuanSum,
  type TokenStats,
} from "../ai-usage-helpers";

// 保留单引号写法：page.test.tsx 以源码文本断言图表 Module 通过 import('./AiTokenUsageChart') 延迟加载
// prettier-ignore
const AiTokenUsageChart = lazy(() => import('./AiTokenUsageChart'));

const aiTokenChartFallback = (
  <div
    className="flex h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground"
    role="status"
  >
    <Loader2 className="h-4 w-4 animate-spin" />
    正在加载用量图表...
  </div>
);

export function AiUsageTrendCard({
  tokenStats,
  statsDays,
  setStatsDays,
  statsLoading,
  statsError,
  loadTokenStats,
  stats24h,
  stats30d,
  summaryLoading,
}: {
  tokenStats: TokenStats | null;
  statsDays: string;
  setStatsDays: (days: string) => void;
  statsLoading: boolean;
  statsError: boolean;
  loadTokenStats: (days: string) => unknown;
  stats24h: TokenStats | null;
  stats30d: TokenStats | null;
  summaryLoading: boolean;
}) {
  const { data: chartData, models: chartModels } = tokenStats?.daily?.length
    ? buildChartData(tokenStats.daily)
    : { data: [], models: [] };
  return (
    <>
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
              <button
                className="text-xs text-primary underline"
                onClick={() => void loadTokenStats(statsDays)}
              >
                重试
              </button>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <BarChart2 className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  暂无 Token 使用数据
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  与 AI 助手对话后，这里会显示用量趋势图
                </p>
              </div>
              <Link
                href="/dashboard?ai=1"
                className="text-xs text-primary hover:underline"
              >
                前往 AI 助手对话 →
              </Link>
            </div>
          ) : (
            <Suspense fallback={aiTokenChartFallback}>
              <AiTokenUsageChart
                data={chartData}
                models={chartModels}
                statsDays={statsDays}
              />
            </Suspense>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  今日 Token（近 24 小时）
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {summaryLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatTokensM(stats24h?.totalTokens ?? 0)}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  今日预计花费（近 24 小时）
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {summaryLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatYuanSum(estimateSumYuan(stats24h?.byModel ?? []))}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  按公开价估算，以账单为准
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  近 30 天预计花费
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {summaryLoading ? (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatYuanSum(estimateSumYuan(stats30d?.byModel ?? []))}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {stats30d ? `共 ${stats30d.totalRequests} 次请求` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
          {tokenStats && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                总请求：
                <b className="text-foreground">{tokenStats.totalRequests}</b>
              </span>
              <span>
                总消耗：
                <b className="text-foreground">
                  {formatTokensM(tokenStats.totalTokens)}
                </b>
              </span>
              {tokenStats.byModel.map((m) => {
                const cost = estimateCost(m.model, m.tokens ?? 0);
                return (
                  <span key={m.model}>
                    {m.model}：
                    <b className="text-foreground">
                      {formatTokensM(m.tokens ?? 0)}
                    </b>
                    {cost && (
                      <span className="ml-1 text-muted-foreground/60">
                        {cost}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
