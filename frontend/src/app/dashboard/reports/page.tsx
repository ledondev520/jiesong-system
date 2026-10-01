/**
 * Input: reportsService.getBusinessOverview API
 * Output: 经营数据报表页面（老板视角）
 * Pos: Dashboard > 经营执行，提供公司整体经营状况、资金风险、库存健康度与趋势
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Percent,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Package,
  Ship,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, OPERATIONS_TABS } from '@/components/layout/ModuleTabHeader';
import { reportsService, type BusinessOverview } from '@/services/reports.service';
import { Button } from '@/components/ui/button';
import { ChartTooltip } from '@/components/finance/ChartTooltip';

const formatCurrency = (amount: number | null, currency: 'USD' | 'CNY') => {
  if (amount === null) return '待核验';
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value: number | null) => value === null ? '待核验' : `${(value * 100).toFixed(1)}%`;

const REPORT_COLORS = {
  sales: '#10b981',
  purchases: '#ef4444',
  profit: '#3b82f6',
};

export default function BusinessReportsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [period, setPeriod] = useState<{ startDate?: string; endDate?: string }>({});
  const [data, setData] = useState<BusinessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await reportsService.getBusinessOverview(period);
      if (res.data.overview.currency !== 'CNY') throw new Error('经营报表币种口径尚未更新');
      setData(res.data);
    } catch (e) {
      console.error('获取经营报表失败:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="经营执行" showBack={false} />
        <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="经营执行" showBack={false} />
        <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />
        <Card className="border-border/40">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <span className="rounded-full bg-muted/60 p-4">
              <AlertCircle className="h-6 w-6 text-muted-foreground/70" />
            </span>
            <p className="text-sm text-muted-foreground/80">数据加载失败，请重试</p>
            <Button variant="outline" size="sm" className="rounded-lg h-9 px-4" onClick={fetchData}>
              重新加载
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { overview, funds, inventory, trends } = data;
  const salesParams = new URLSearchParams({ shipped: 'true' });
  if (data.period.startDate) salesParams.set('shippedFrom', data.period.startDate);
  if (data.period.endDate) salesParams.set('shippedTo', data.period.endDate);
  const salesHref = `/dashboard/sales?${salesParams.toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader title="经营执行" showBack={false} />
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="space-y-1"><Label htmlFor="report-start">发运开始日期</Label><Input id="report-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="report-end">发运结束日期</Label><Input id="report-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          <Button disabled={loading || Boolean(startDate && endDate && startDate > endDate)} onClick={() => setPeriod({ startDate: startDate || undefined, endDate: endDate || undefined })}>应用期间</Button>
          <Button variant="outline" onClick={() => { setStartDate(''); setEndDate(''); setPeriod({}); }}>全部期间</Button>
        </CardContent>
      </Card>
      {error && <div role="alert" className="text-destructive">更新失败，当前仍为上次已加载期间。<Button variant="outline" onClick={fetchData}>重试</Button></div>}
      <p className="text-sm text-muted-foreground">发运期间：{data.period.startDate || '最早'} 至 {data.period.endDate || '当前'}，共 {overview.contractCount} 笔；{overview.scope}</p>
      {!overview.marginReady && <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">毛利待核验，缺少汇率或已售成本。{overview.unavailableContracts.map((contract, index) => <Link key={contract.id} className="ml-2 underline" href={`/dashboard/sales/${contract.id}?tab=finance`}>核验第{index + 1}笔：{contract.reasons.join('；')}</Link>)}</div>}
      {/* 经营概览 */}
      <section aria-label="经营概览" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">经营概览</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                发运销售额（CNY）
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <DollarSign className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(overview.totalSales, 'CNY')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href={salesHref}>查看发运销售明细</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                匹配已售采购成本（CNY）
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <ShoppingCart className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(overview.totalPurchases, 'CNY')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href={salesHref}>查看已售成本与单柜财务</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                商品毛利（CNY）
              </CardTitle>
              <span className="rounded-xl bg-emerald-500/8 p-2 text-emerald-600 ring-1 ring-emerald-500/12 transition-all duration-200 group-hover:bg-emerald-500/12">
                <TrendingUp className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(overview.grossProfit, 'CNY')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href={salesHref}>查看单柜毛利明细</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                利润率
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <Percent className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatPercent(overview.profitMargin)}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href={salesHref}>查看单柜利润率</Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 资金状况 */}
      <section aria-label="资金状况" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">资金状况（当前全量）</h2>
        <p className="text-xs text-muted-foreground">{funds.overdueRule}。超过交期待付按采购交期判断，不代表付款到期。</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                应收总额
              </CardTitle>
              <span className="rounded-xl bg-blue-500/8 p-2 text-blue-600 ring-1 ring-blue-500/12 transition-all duration-200 group-hover:bg-blue-500/12">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(funds.totalReceivable, 'USD')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/payments?tab=receivable">查看应收明细</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                应付总额
              </CardTitle>
              <span className="rounded-xl bg-amber-500/8 p-2 text-amber-600 ring-1 ring-amber-500/12 transition-all duration-200 group-hover:bg-amber-500/12">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(funds.totalPayable, 'CNY')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/payments?tab=payable">查看应付明细</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group border-destructive/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-destructive/80">
                发运超过30天未收
              </CardTitle>
              <span className="rounded-xl bg-destructive/8 p-2 text-destructive ring-1 ring-destructive/12 transition-all duration-200 group-hover:bg-destructive/12">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none text-destructive">
                {formatCurrency(funds.overdueReceivable, 'USD')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/payments?tab=receivable&overdue=true">查看发运超过30天未收明细</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group border-destructive/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-destructive/80">
                超过交期待付
              </CardTitle>
              <span className="rounded-xl bg-destructive/8 p-2 text-destructive ring-1 ring-destructive/12 transition-all duration-200 group-hover:bg-destructive/12">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none text-destructive">
                {formatCurrency(funds.overduePayable, 'CNY')}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/payments?tab=payable&pastDelivery=true">查看超过交期待付明细</Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 库存与物流 */}
      <section aria-label="库存与物流" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">库存与物流</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                活跃商品总数
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <Package className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {inventory.totalItems}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/products">查看活跃商品</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                低库存预警
              </CardTitle>
              <span className="rounded-xl bg-amber-500/8 p-2 text-amber-600 ring-1 ring-amber-500/12 transition-all duration-200 group-hover:bg-amber-500/12">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {inventory.lowStockItems}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/products?lowStock=true">查看低库存商品</Link>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                在途货柜
              </CardTitle>
              <span className="rounded-xl bg-blue-500/8 p-2 text-blue-600 ring-1 ring-blue-500/12 transition-all duration-200 group-hover:bg-blue-500/12">
                <Ship className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {inventory.inTransitContainers}
              </div>
              <Link className="mt-3 inline-block text-xs text-primary underline" href="/dashboard/sales?status=SHIPPED">查看已发运未到港货柜</Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card><CardHeader><CardTitle className="text-base">所选发运单据净现金（CNY）</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{formatCurrency(overview.netCashCny, 'CNY')}</p><p className="mt-2 text-xs text-muted-foreground">累计已收折算人民币 + 已退税 − 按已售成本分摊采购已付；显示所选单据的累计占用，不是期间银行现金流。{!overview.cashReady && '采购关联或币种缺失，现金占用待核验。'}</p><Link className="mt-3 inline-block text-sm text-primary underline" href={salesHref}>查看单柜现金占用与收付追溯</Link><Link className="ml-3 text-sm text-primary underline" href="/dashboard/finance/statements">公司利润请查看财务报表</Link></CardContent></Card>
      {/* 月度趋势图 */}
      <section aria-label="月度销售趋势" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">月度销售趋势（CNY，按发运月）</h2>
        <Card className="border-border/40">
          <CardContent className="pt-6">
            {trends.monthlySales.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <span className="rounded-full bg-muted/50 p-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
                </span>
                <p className="text-sm text-muted-foreground/60">所选发运期间暂无销售趋势；全部期间显示近6个月</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={trends.monthlySales}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(v) => v.substring(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        valueFormatter={(v) => `¥${Number(v).toLocaleString()}`}
                      />
                    }
                  />
                  <Legend />
                  <Bar dataKey="amount" name="销售额" fill={REPORT_COLORS.sales} radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="趋势线"
                    stroke={REPORT_COLORS.profit}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
