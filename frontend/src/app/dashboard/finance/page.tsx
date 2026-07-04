/**
 * Input: 后端 finance/stats、finance/payment-trends、system/exchange-rate、bank-flow/stats、invoices/stats API
 * Output: 财务概览页面（收付进度 + 汇率 + 银行流水/发票摘要 + 紧迫信号 + 趋势折线图 + 快捷导航）
 * Pos: 财务模块首页，提供公司财务进度驾驶舱
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  RefreshCw,
  Landmark,
  FileText,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { financeService } from '@/services/finance.service';
import {
  getTransactionStats, getInvoiceStats,
  type BankFlowStats, type InvoiceStats,
} from '@/services/bankFlow.service';
import api from '@/lib/axios';
import { type ApiResponse } from '@/types';
import { cachedFetch } from '@/lib/api-cache';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, LoadingState } from '@/components/ui/data-state';
import { KpiCard } from '@/components/finance/KpiCard';
import { ChartTooltip } from '@/components/finance/ChartTooltip';

interface PaymentTrendPoint {
  label: string;
  receivables: number;
  payables: number;
}

interface OverdueItem {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  unreceived: number;
  shippedAt: string;
  overdueDays: number;
  status: string;
}

interface FinanceStats {
  payable: { total: number; paid: number; unpaid: number };
  receivable: { total: number; received: number; unreceived: number };
}

interface ExchangeRate {
  rate: number;
  buffer: number;
  effectiveRate: number;
}

const FINANCE_COLORS = {
  income: '#10b981',
  expense: '#ef4444',
  profit: '#3b82f6',
  primary: 'hsl(var(--primary))',
  warning: '#f59e0b',
};

function calcTrendDirection(current: number, previous: number): 'up' | 'down' | 'neutral' {
  if (!previous || previous === 0) return 'neutral';
  const diff = ((current - previous) / previous) * 100;
  if (diff > 0.1) return 'up';
  if (diff < -0.1) return 'down';
  return 'neutral';
}

function calcTrendValue(current: number, previous: number): string {
  if (!previous || previous === 0) return '环比持平';
  const diff = ((current - previous) / previous) * 100;
  const sign = diff > 0 ? '+' : '';
  return `环比 ${sign}${diff.toFixed(1)}%`;
}

/**
 * 职责：渲染财务概览驾驶舱
 * 思路：
 *   1. 顶部 KPI 卡片：总额、已付/已收、待付/待收（带完成率进度条）
 *   2. 中部驾驶舱卡片：汇率显示、紧迫性预警、账款健康度
 *   3. 报表分析入口：三表分析放在专门页面，避免概览首屏重复加载重模块
 */
export default function FinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [trends, setTrends] = useState<PaymentTrendPoint[]>([]);
  const [trendDays, setTrendDays] = useState<30 | 90>(90);
  const [overdueList, setOverdueList] = useState<OverdueItem[]>([]);
  const [bankStats, setBankStats] = useState<BankFlowStats | null>(null);
  const [invStats, setInvStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);

    try {
      const [statsRes, rateRes, trendsRes, overdueRes, bankStatsRes, invStatsRes] = await Promise.all([
        cachedFetch('fin-stats', () => financeService.getStats()),
        cachedFetch('fin-exchange-rate', () => api.get<ApiResponse<ExchangeRate>, ApiResponse<ExchangeRate>>('/system/exchange-rate')),
        cachedFetch(`fin-payment-trends-${trendDays}`, () => api.get<ApiResponse<PaymentTrendPoint[]>, ApiResponse<PaymentTrendPoint[]>>(
          `/finance/payment-trends?days=${trendDays}`
        )),
        cachedFetch('fin-overdue-receivables', () => api.get<ApiResponse<OverdueItem[]>, ApiResponse<OverdueItem[]>>('/finance/overdue-receivables')),
        getTransactionStats().catch(() => null),
        getInvoiceStats().catch(() => null),
      ]);
      setStats(statsRes);
      if (rateRes.data) setExchangeRate(rateRes.data);
      if (trendsRes.data) setTrends(trendsRes.data);
      if (overdueRes.data) setOverdueList(overdueRes.data);
      setBankStats(bankStatsRes);
      setInvStats(invStatsRes);
    } catch (err) {
      console.error('获取财务数据失败:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [trendDays]);

  useEffect(() => {
    void loadData(hasLoadedRef.current);
    hasLoadedRef.current = true;
  }, [loadData]);

  // 计算同比/环比（基于 trends 数组最后两个点）
  const { payableTrend, receivableTrend, payableTrendDir, receivableTrendDir } = useMemo(() => {
    if (trends.length < 2 || !trends[trends.length - 1] || !trends[trends.length - 2]) {
      return {
        payableTrend: '环比持平',
        receivableTrend: '环比持平',
        payableTrendDir: 'neutral' as const,
        receivableTrendDir: 'neutral' as const,
      };
    }
    const last = trends[trends.length - 1];
    const prev = trends[trends.length - 2];
    return {
      payableTrend: calcTrendValue(last.payables, prev.payables),
      receivableTrend: calcTrendValue(last.receivables, prev.receivables),
      payableTrendDir: calcTrendDirection(last.payables, prev.payables),
      receivableTrendDir: calcTrendDirection(last.receivables, prev.receivables),
    };
  }, [trends]);

  // 现金流预测（简单线性外推）
  const cashFlowForecast = useMemo(() => {
    if (trends.length < 2 || !trends[trends.length - 1] || !trends[trends.length - 2]) return [];
    const last = trends[trends.length - 1];
    const prev = trends[trends.length - 2];
    const delta = (last.receivables - last.payables) - (prev.receivables - prev.payables);
    const base = last.receivables - last.payables;
    return [
      { label: `${last.label} (实际)`, value: base, type: 'actual' },
      { label: '预测 +1期', value: base + delta, type: 'forecast' },
      { label: '预测 +2期', value: base + delta * 2, type: 'forecast' },
      { label: '预测 +3期', value: base + delta * 3, type: 'forecast' },
    ];
  }, [trends]);

  if (loading) {
    return (
      <LoadingState
        title="加载中..."
        description="正在同步财务概览、汇率和账款趋势数据。"
      />
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="财务概览"
          description="公司财务进度、收支健康、成本结构与利润趋势。"
          actions={
            <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              重试
            </Button>
          }
        />
        <ErrorState
          title="数据加载失败"
          description="无法连接到服务器，请检查网络连接或稍后重试。"
          action={
            <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              重试
            </Button>
          }
        />
      </div>
    );
  }

  // 计算完成率与紧迫度
  const payableRate = stats && stats.payable.total > 0
    ? Math.round((stats.payable.paid / stats.payable.total) * 100)
    : 0;
  const receivableRate = stats && stats.receivable.total > 0
    ? Math.round((stats.receivable.received / stats.receivable.total) * 100)
    : 0;

  // 紧迫性阈值：待付/待收超过总额 50% 时高亮警示
  const payableUrgent = stats ? (stats.payable.unpaid / Math.max(stats.payable.total, 1)) > 0.5 : false;
  const receivableUrgent = stats ? (stats.receivable.unreceived / Math.max(stats.receivable.total, 1)) > 0.5 : false;

  const hasData = stats && (stats.payable.total > 0 || stats.receivable.total > 0);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
      <PageHeader
        title="财务概览"
        description="公司财务进度、收支健康、成本结构与利润趋势。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <section className="space-y-4">
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">公司财务进度</p>
              <h3 className="text-lg font-semibold tracking-tight">先看收付压力，再下钻经营执行</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                财务概览先给出应付完成率、应收完成率和待付待收风险；三表导入、账期选择和收入利润、成本结构、资产负债下钻集中放在报表分析页面。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Button asChild className="h-11 rounded-xl">
                <Link href="/dashboard/payments">
                  <Wallet className="mr-2 h-4 w-4" />
                  进入收付管理
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl">
                <Link href="/dashboard/payments?tab=payable">查看待付风险</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl">
                <Link href="/dashboard/finance/statements">查看报表分析</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 汇率与健康度横幅 */}
      {hasData && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          {/* 汇率卡 */}
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">当前结算汇率</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {exchangeRate?.effectiveRate != null ? exchangeRate.effectiveRate.toFixed(2) : '—'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">¥/$</span>
                  </p>
                  {exchangeRate && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      市场汇率 {exchangeRate.rate?.toFixed(2) ?? '—'} · 风险缓冲 {exchangeRate.buffer?.toFixed(2) ?? '—'}
                    </p>
                  )}
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-60" />
              </div>
            </CardContent>
          </Card>

          {/* 应付完成率 */}
          <Card className={payableUrgent ? 'border-destructive/40 bg-destructive/5' : 'border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10'}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">应付账款完成率</p>
                {payableUrgent
                  ? <AlertTriangle className="h-4 w-4 text-destructive" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                }
              </div>
              <p className="text-2xl font-bold tabular-nums mb-2">{payableRate}%</p>
              <Progress
                value={payableRate}
                className={`h-2 ${payableUrgent ? '[&>div]:bg-destructive' : '[&>div]:bg-emerald-600'}`}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                已付 ¥{(stats?.payable.paid ?? 0).toLocaleString()} / 总额 ¥{(stats?.payable.total ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          {/* 应收完成率 */}
          <Card className={receivableUrgent ? 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10' : 'border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10'}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">应收账款完成率</p>
                {receivableUrgent
                  ? <AlertTriangle className="h-4 w-4 text-amber-600" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                }
              </div>
              <p className="text-2xl font-bold tabular-nums mb-2">{receivableRate}%</p>
              <Progress
                value={receivableRate}
                className={`h-2 ${receivableUrgent ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-600'}`}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                已收 USD {(stats?.receivable.received ?? 0).toLocaleString()} / 总额 USD {(stats?.receivable.total ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 四象KPI区域 - 使用专业卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
        <KpiCard
          label="应付账款总额"
          value={`¥${(stats?.payable.total ?? 0).toLocaleString()}`}
          subLabel={`已付 ¥${(stats?.payable.paid ?? 0).toLocaleString()}`}
          trend={payableTrendDir}
          trendValue={payableTrend}
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <KpiCard
          label="待付账款"
          value={`¥${(stats?.payable.unpaid ?? 0).toLocaleString()}`}
          subLabel={payableUrgent ? '超过总额50%，建议优先处理' : '尚未支付给供应商'}
          trend="down"
          trendValue={payableUrgent ? '高风险' : '正常'}
          icon={<Wallet className="h-4 w-4" />}
          valueClassName={payableUrgent ? 'text-destructive' : undefined}
        />
        <KpiCard
          label="应收账款总额"
          value={`USD ${(stats?.receivable.total ?? 0).toLocaleString()}`}
          subLabel={`已收 USD ${(stats?.receivable.received ?? 0).toLocaleString()}`}
          trend={receivableTrendDir}
          trendValue={receivableTrend}
          icon={<ArrowDownLeft className="h-4 w-4" />}
        />
        <KpiCard
          label="待收账款"
          value={`USD ${(stats?.receivable.unreceived ?? 0).toLocaleString()}`}
          subLabel={receivableUrgent ? '当前客户剩余欠款偏高，建议优先跟进' : '当前客户剩余欠款'}
          trend="neutral"
          trendValue={receivableUrgent ? '需跟进' : '正常'}
          icon={<DollarSign className="h-4 w-4" />}
          valueClassName={receivableUrgent ? 'text-amber-600' : undefined}
        />
      </div>

      {/* 收支对比柱状图 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium">收支对比</CardTitle>
            <CardDescription className="text-xs">
              {trendDays === 30 ? '近 30 天' : '近 90 天'} 应收 vs 应付资金对比
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={trendDays === 30 ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => setTrendDays(30)}
            >
              30天
            </Button>
            <Button
              size="sm"
              variant={trendDays === 90 ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => setTrendDays(90)}
            >
              90天
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {trends.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="暂无收付款数据"
              description="请先录入收付款记录，趋势图会在此自动生成。"
              className="py-10"
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trends} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={50} axisLine={false} tickLine={false} />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(v) => Number(v).toLocaleString('zh-CN')}
                    />
                  }
                />
                <Legend
                  formatter={(value) => value === 'receivables' ? '应收回款 (USD)' : '应付付款 (CNY)'}
                />
                <Bar dataKey="receivables" name="receivables" fill={FINANCE_COLORS.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="payables" name="payables" fill={FINANCE_COLORS.expense} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 现金流预测 */}
      {cashFlowForecast.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              现金流预测
            </CardTitle>
            <CardDescription className="text-xs">
              基于近期收支趋势线性外推（单位：USD/CNY 混合）
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
                      valueFormatter={(v) => Number(v).toLocaleString('zh-CN')}
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

      {/* 银行流水 & 发票台账摘要 */}
      {(bankStats || invStats) && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {bankStats && (
            <Link href="/dashboard/finance/bank-flow" className="group">
              <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">银行流水</CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">总收入</p>
                      <p className="text-base font-bold text-emerald-600 tabular-nums">
                        ¥{bankStats.totalIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">总支出</p>
                      <p className="text-base font-bold text-red-600 tabular-nums">
                        ¥{bankStats.totalOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">净现金流</p>
                      <p className={`text-base font-bold tabular-nums ${bankStats.netFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        ¥{bankStats.netFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">交易笔数</p>
                      <p className="text-base font-bold tabular-nums">{bankStats.txnCount.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {invStats && (
            <Link href="/dashboard/finance/invoices" className="group">
              <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">发票台账</CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">有效发票金额</p>
                      <p className="text-base font-bold text-primary tabular-nums">
                        ¥{invStats.validTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">有效税额</p>
                      <p className="text-base font-bold tabular-nums">
                        ¥{invStats.validTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">有效发票数</p>
                      <p className="text-base font-bold tabular-nums">{invStats.validCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">已红冲 / 总记录</p>
                      <p className="text-base font-bold tabular-nums text-muted-foreground">
                        {invStats.reversedCount} / {invStats.totalCount}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* 应收逾期预警 */}
      {overdueList.length > 0 && (
        <Card className="border-red-500/40 bg-red-50/20 dark:bg-red-950/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <CardTitle className="text-sm font-medium text-red-800 dark:text-red-400">
                应收逾期预警 · {overdueList.length} 单待催收
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              发货 30 天后仍有未回款的合同，建议优先跟进
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueList.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-red-200/50 bg-background px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">{item.contractNo}</span>
                    <Badge variant="outline" className="text-xs border-red-500/50 text-red-700 dark:text-red-400">
                      逾期 {item.overdueDays} 天
                    </Badge>
                  </div>
                  <span className="tabular-nums text-red-700 dark:text-red-400 font-medium">
                    USD {item.unreceived.toLocaleString()}
                  </span>
                </div>
              ))}
              {overdueList.length > 5 && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  还有 {overdueList.length - 5} 条逾期记录，
                  <Link href="/dashboard/payments?tab=receivable" className="text-primary underline-offset-2 hover:underline">
                    查看全部应收明细
                  </Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 快捷导航区 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
        <Link href="/dashboard/payments?tab=payable" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">应付账款明细</p>
                  <p className="text-xs text-muted-foreground mt-0.5">查看各供应商欠款详情</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/payments?tab=receivable" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">应收账款明细</p>
                  <p className="text-xs text-muted-foreground mt-0.5">查看各门店待回款详情</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/payments" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">收付管理</p>
                  <p className="text-xs text-muted-foreground mt-0.5">流水明细与登记操作</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/statements" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm border-primary/20 bg-primary/[0.03]">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">财务报表分析</p>
                  <p className="text-xs text-muted-foreground mt-0.5">收入利润、成本结构、资产负债</p>
                </div>
                <BarChart3 className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/bank-flow" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">银行流水查询</p>
                  <p className="text-xs text-muted-foreground mt-0.5">按对方名称、日期查看资金往来</p>
                </div>
                <Landmark className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/invoices" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">发票台账查询</p>
                  <p className="text-xs text-muted-foreground mt-0.5">按销方、状态筛选发票明细</p>
                </div>
                <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 无数据引导态 */}
      {!hasData && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <EmptyState
              icon={DollarSign}
              title="暂无财务记录"
              description="导入采购或出口合同数据后，应付 / 应收账款将自动汇总显示在此。"
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/payments?tab=payable">查看应付明细</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/dashboard/payments?tab=receivable">查看应收明细</Link>
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* 账款货币说明 */}
      {hasData && (
        <p className="text-xs text-muted-foreground text-center">
          应付账款以人民币（CNY / ¥）计；应收账款以美元（USD）计。汇率数据来自系统配置。
        </p>
      )}
    </div>
  );
}
