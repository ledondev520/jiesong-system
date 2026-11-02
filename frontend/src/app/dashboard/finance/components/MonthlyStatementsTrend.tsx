/**
 * Input: 财务报表分析接口（与「财务报表」页同一数据路径与缓存键）
 * Output: 财务概览的月度收入/净利润趋势图，含「数据截至」新旧提示与显式空/错误状态
 * Pos: 财务概览延迟加载图表；收付款流水图在近 N 天无记录时为空，这里始终有月度数据可看
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/data-state";
import { ChartTooltip } from "@/components/finance/ChartTooltip";
import { cachedFetch } from "@/lib/api-cache";
import { formatCnyAxisTick, formatMonthAxisTick } from "@/lib/chart-axis";
import { formatMoney } from "@/lib/format";
import {
  financialStatementsService,
  type AnalyticsData,
} from "@/services/financialStatements.service";
import { FinancialStatementsStaleness } from "../statements/components/FinancialStatementsStaleness";

const MAX_MONTHS = 12;

export default function MonthlyStatementsTrend() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setAnalytics(
        await cachedFetch("fin-statements-analytics", () =>
          financialStatementsService.getAnalytics(),
        ),
      );
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const points = useMemo(
    () =>
      [...(analytics?.trends ?? [])]
        .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
        .slice(-MAX_MONTHS)
        .map((t) => ({
          period: `${t.year}-${String(t.month).padStart(2, "0")}`,
          year: t.year,
          month: t.month,
          revenue: t.revenue,
          netProfit: t.netProfit,
        })),
    [analytics],
  );

  return (
    <Card data-testid="monthly-statements-trend">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          月度收入与净利润（财务报表）
        </CardTitle>
        <CardDescription className="text-xs">
          取自已导入的月度财务报表，与「财务报表」页同一数据，单位 CNY
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            正在加载月度趋势...
          </p>
        ) : state === "error" ? (
          <ErrorState
            title="月度趋势加载失败"
            action={<Button onClick={() => void load()}>重试</Button>}
          />
        ) : points.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="暂无已导入的财务报表账期"
            description="导入月度财务报表后，这里会按月显示收入与净利润。"
            className="py-10"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/finance/statements">去导入报表</Link>
              </Button>
            }
          />
        ) : (
          <>
            <FinancialStatementsStaleness periods={points} />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={points}
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickFormatter={formatMonthAxisTick}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickFormatter={formatCnyAxisTick}
                  width={56}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(value) => formatMoney(value, "CNY")}
                    />
                  }
                />
                <Legend
                  formatter={(value) =>
                    value === "revenue" ? "营业收入" : "净利润"
                  }
                />
                <Bar
                  dataKey="revenue"
                  name="revenue"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="netProfit"
                  name="netProfit"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
