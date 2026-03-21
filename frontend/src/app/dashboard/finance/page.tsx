/**
 * Input: 后端 finance/stats、finance/payment-trends、system/exchange-rate API
 * Output: 财务经营驾驶舱页面（KPI + 完成率 + 汇率 + 紧迫信号 + 趋势折线图 + 快捷导航）
 * Pos: 财务模块首页，提供管理层决策快速视图
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
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
  Loader2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  RefreshCw,
  ServerCrash,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { financeService } from '@/services/finance.service';
import api from '@/lib/axios';
import { type ApiResponse } from '@/types';
import { cachedFetch } from '@/lib/api-cache';

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

/**
 * 职责：渲染财务经营驾驶舱
 * 思路：
 *   1. 顶部 KPI 卡片：总额、已付/已收、待付/待收（带完成率进度条）
 *   2. 中部驾驶舱卡片：汇率显示、紧迫性预警、账款健康度
 *   3. 底部快捷导航：应付、应收、报表、收付款记录
 */
export default function FinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [trends, setTrends] = useState<PaymentTrendPoint[]>([]);
  const [trendDays, setTrendDays] = useState<30 | 90>(90);
  const [overdueList, setOverdueList] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);

    try {
      const [statsRes, rateRes, trendsRes, overdueRes] = await Promise.all([
        cachedFetch('fin-stats', () => financeService.getStats()),
        cachedFetch('fin-exchange-rate', () => api.get<ApiResponse<ExchangeRate>, ApiResponse<ExchangeRate>>('/system/exchange-rate')),
        cachedFetch(`fin-payment-trends-${trendDays}`, () => api.get<ApiResponse<PaymentTrendPoint[]>, ApiResponse<PaymentTrendPoint[]>>(
          `/finance/payment-trends?days=${trendDays}`
        )),
        cachedFetch('fin-overdue-receivables', () => api.get<ApiResponse<OverdueItem[]>, ApiResponse<OverdueItem[]>>('/finance/overdue-receivables')),
      ]);
      setStats(statsRes);
      if (rateRes.data) setExchangeRate(rateRes.data);
      if (trendsRes.data) setTrends(trendsRes.data);
      if (overdueRes.data) setOverdueList(overdueRes.data);
    } catch (err) {
      console.error('获取财务数据失败:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 切换趋势周期时重新拉取
  useEffect(() => {
    if (!loading) void loadData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendDays]);

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="财务驾驶舱"
          description="资金流水与应收应付全局概览，实时监控经营健康度。"
          actions={
            <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              重试
            </Button>
          }
        />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <ServerCrash className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-base">数据加载失败</CardTitle>
            <CardDescription>
              无法连接到服务器，请检查网络连接或稍后重试。
            </CardDescription>
          </CardHeader>
        </Card>
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
      <PageHeader
        title="财务驾驶舱"
        description="资金流水与应收应付全局概览，实时监控经营健康度。"
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

      {/* 汇率与健康度横幅 */}
      {hasData && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* 汇率卡 */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">当前结算汇率</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {exchangeRate ? exchangeRate.effectiveRate.toFixed(2) : '—'}
                    <span className="text-sm font-normal text-muted-foreground ml-1">¥/$</span>
                  </p>
                  {exchangeRate && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      市场汇率 {exchangeRate.rate.toFixed(2)} · 风险缓冲 {exchangeRate.buffer.toFixed(2)}
                    </p>
                  )}
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-60" />
              </div>
            </CardContent>
          </Card>

          {/* 应付完成率 */}
          <Card className={payableUrgent ? 'border-destructive/40 bg-destructive/5' : 'border-green-500/30 bg-green-50/30 dark:bg-green-950/10'}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">应付账款完成率</p>
                {payableUrgent
                  ? <AlertTriangle className="h-4 w-4 text-destructive" />
                  : <CheckCircle2 className="h-4 w-4 text-green-600" />
                }
              </div>
              <p className="text-2xl font-bold tabular-nums mb-2">{payableRate}%</p>
              <Progress
                value={payableRate}
                className={`h-2 ${payableUrgent ? '[&>div]:bg-destructive' : '[&>div]:bg-green-600'}`}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                已付 ¥{(stats?.payable.paid ?? 0).toLocaleString()} / 总额 ¥{(stats?.payable.total ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          {/* 应收完成率 */}
          <Card className={receivableUrgent ? 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10' : 'border-green-500/30 bg-green-50/30 dark:bg-green-950/10'}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">应收账款完成率</p>
                {receivableUrgent
                  ? <AlertTriangle className="h-4 w-4 text-amber-600" />
                  : <CheckCircle2 className="h-4 w-4 text-green-600" />
                }
              </div>
              <p className="text-2xl font-bold tabular-nums mb-2">{receivableRate}%</p>
              <Progress
                value={receivableRate}
                className={`h-2 ${receivableUrgent ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-600'}`}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                已收 USD {(stats?.receivable.received ?? 0).toLocaleString()} / 总额 USD {(stats?.receivable.total ?? 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 四象KPI区域 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* 应付总额 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">应付账款总额</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums text-primary">
              ¥{(stats?.payable.total ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              已付 ¥{(stats?.payable.paid ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 待付账款 */}
        <Card className={`kpi-card ${payableUrgent ? 'border-destructive/30' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              待付账款
              {payableUrgent && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">待处理</Badge>
              )}
            </CardTitle>
            <Wallet className={`h-4 w-4 ${payableUrgent ? 'text-destructive' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold tabular-nums ${payableUrgent ? 'text-destructive' : ''}`}>
              ¥{(stats?.payable.unpaid ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {payableUrgent ? '⚠ 超过总额50%，建议优先处理' : '尚未支付给供应商'}
            </p>
          </CardContent>
        </Card>

        {/* 应收总额 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">应收账款总额</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums text-primary">
              USD {(stats?.receivable.total ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              已收 USD {(stats?.receivable.received ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 待收账款 */}
        <Card className={`kpi-card ${receivableUrgent ? 'border-amber-500/30' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              待收账款
              {receivableUrgent && (
                <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500 hover:bg-amber-500">催收</Badge>
              )}
            </CardTitle>
            <DollarSign className={`h-4 w-4 ${receivableUrgent ? 'text-amber-600' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold tabular-nums ${receivableUrgent ? 'text-amber-600' : ''}`}>
              USD {(stats?.receivable.unreceived ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {receivableUrgent ? '⚠ 超过总额50%，建议跟进催收' : '待从门店收回'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 收付款趋势折线图 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium">收付款趋势</CardTitle>
            <CardDescription className="text-xs">
              {trendDays === 30 ? '近 30 天' : '近 90 天'}按周统计的资金流向
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
            <div className="flex items-center justify-center h-36 text-sm text-muted-foreground">
              暂无收付款数据，请先录入收付款记录
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trends} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={50} />
                <Tooltip
                  formatter={
                    /* Recharts Formatter generics require exact overload match; cast avoids inference errors */
                    ((value: number | string | undefined, name: string | undefined) => [
                      Number(value ?? 0).toLocaleString(),
                      (name ?? '') === 'receivables' ? '应收回款' : '应付付款',
                    ]) as Parameters<typeof Tooltip>[0]['formatter']
                  }
                />
                <Legend
                  formatter={(value) => value === 'receivables' ? '应收回款 (USD)' : '应付付款 (CNY)'}
                />
                <Line
                  type="monotone"
                  dataKey="receivables"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="payables"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 应收逾期预警 */}
      {overdueList.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-400">
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
                  className="flex items-center justify-between rounded-md border border-amber-200/50 bg-background px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">{item.contractNo}</span>
                    <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
                      逾期 {item.overdueDays} 天
                    </Badge>
                  </div>
                  <span className="tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                    USD {item.unreceived.toLocaleString()}
                  </span>
                </div>
              ))}
              {overdueList.length > 5 && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  还有 {overdueList.length - 5} 条逾期记录，
                  <Link href="/dashboard/finance/receivable" className="text-primary underline-offset-2 hover:underline">
                    查看全部应收明细
                  </Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 快捷导航区 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/finance/payable" className="group">
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

        <Link href="/dashboard/finance/receivable" className="group">
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
                  <p className="text-sm font-medium">收付款记录</p>
                  <p className="text-xs text-muted-foreground mt-0.5">流水明细与登记操作</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/statements" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">财务报表分析</p>
                  <p className="text-xs text-muted-foreground mt-0.5">趋势图表与三表概览</p>
                </div>
                <BarChart3 className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 无数据引导态 */}
      {!hasData && (
        <Card className="border-dashed">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <DollarSign className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-base">暂无财务记录</CardTitle>
            <CardDescription>
              导入采购或销售合同数据后，应付 / 应收账款将自动汇总显示在此。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3 pb-6">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/finance/payable">查看应付明细</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/finance/receivable">查看应收明细</Link>
            </Button>
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
