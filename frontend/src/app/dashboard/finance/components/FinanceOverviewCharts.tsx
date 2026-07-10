/**
 * Input: 统一 CNY 口径的收付趋势、现金流预测、区间与结算汇率
 * Output: 财务概览的收支对比与现金流预测图表
 * Pos: 财务概览延迟加载的内部图表 Module，隔离 recharts 实现
 */

'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartTooltip } from '@/components/finance/ChartTooltip';
import type {
  CashFlowForecastPoint,
  CnyPaymentTrendPoint,
} from '@/lib/finance-currency';

const FINANCE_COLORS = {
  income: '#10b981',
  expense: '#ef4444',
  profit: '#3b82f6',
};

interface FinanceOverviewChartsProps {
  cnyTrends: CnyPaymentTrendPoint[];
  cashFlowForecast: CashFlowForecastPoint[];
  trendDays: 30 | 90;
  effectiveRate: number | null;
  onTrendDaysChange: (days: 30 | 90) => void;
}

export default function FinanceOverviewCharts({
  cnyTrends,
  cashFlowForecast,
  trendDays,
  effectiveRate,
  onTrendDaysChange,
}: FinanceOverviewChartsProps) {
  const rateLabel = effectiveRate?.toFixed(2) ?? '—';

  return (
    <div className="space-y-6" data-testid="finance-overview-charts">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium">收支对比</CardTitle>
            <CardDescription className="text-xs">
              {trendDays === 30 ? '近 30 天' : '近 90 天'} 应收按 {rateLabel} 折算后与应付对比（CNY）
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={trendDays === 30 ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => onTrendDaysChange(30)}
            >
              30天
            </Button>
            <Button
              size="sm"
              variant={trendDays === 90 ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => onTrendDaysChange(90)}
            >
              90天
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cnyTrends.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="暂无收付款数据"
              description="请先录入收付款记录，趋势图会在此自动生成。"
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cnyTrends} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={50} axisLine={false} tickLine={false} />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(value) => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}
                    />
                  }
                />
                <Legend
                  formatter={(value) => value === 'receivablesCny' ? '应收回款折算 (CNY)' : '应付付款 (CNY)'}
                />
                <Bar dataKey="receivablesCny" name="receivablesCny" fill={FINANCE_COLORS.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="payablesCny" name="payablesCny" fill={FINANCE_COLORS.expense} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {cashFlowForecast.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              现金流预测
            </CardTitle>
            <CardDescription className="text-xs">
              应收按当前结算汇率 {rateLabel} 折算，统一以 CNY 线性外推
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cashFlowForecast} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={FINANCE_COLORS.profit} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={FINANCE_COLORS.profit} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={50} axisLine={false} tickLine={false} />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(value) => `¥${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`}
                    />
                  }
                />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={FINANCE_COLORS.profit}
                  fill="url(#forecastGradient)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: FINANCE_COLORS.profit, strokeWidth: 2, stroke: 'var(--background)' }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
