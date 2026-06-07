/**
 * Input: reportsService.getBusinessOverview API
 * Output: 经营数据报表页面（老板视角）
 * Pos: Dashboard > 经营执行，提供公司整体经营状况、资金风险、库存健康度与趋势
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

const formatCurrency = (amount: number, currency: 'USD' | 'CNY') => {
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const REPORT_COLORS = {
  sales: '#10b981',
  purchases: '#ef4444',
  profit: '#3b82f6',
};

export default function BusinessReportsPage() {
  const [data, setData] = useState<BusinessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await reportsService.getBusinessOverview();
      setData(res.data);
    } catch (e) {
      console.error('获取经营报表失败:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
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

  if (error || !data) {
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

  return (
    <div className="space-y-6">
      <PageHeader title="经营执行" showBack={false} />
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />

      {/* 经营概览 */}
      <section aria-label="经营概览" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">经营概览</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                累计销售额
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <DollarSign className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(overview.totalSales, 'USD')}
              </div>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                累计采购额
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <ShoppingCart className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(overview.totalPurchases, 'CNY')}
              </div>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                毛利润
              </CardTitle>
              <span className="rounded-xl bg-emerald-500/8 p-2 text-emerald-600 ring-1 ring-emerald-500/12 transition-all duration-200 group-hover:bg-emerald-500/12">
                <TrendingUp className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {formatCurrency(overview.grossProfit, 'USD')}
              </div>
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
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 资金状况 */}
      <section aria-label="资金状况" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">资金状况</h2>
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
            </CardContent>
          </Card>

          <Card className="kpi-card group border-destructive/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-destructive/80">
                逾期应收
              </CardTitle>
              <span className="rounded-xl bg-destructive/8 p-2 text-destructive ring-1 ring-destructive/12 transition-all duration-200 group-hover:bg-destructive/12">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none text-destructive">
                {formatCurrency(funds.overdueReceivable, 'USD')}
              </div>
            </CardContent>
          </Card>

          <Card className="kpi-card group border-destructive/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-destructive/80">
                逾期应付
              </CardTitle>
              <span className="rounded-xl bg-destructive/8 p-2 text-destructive ring-1 ring-destructive/12 transition-all duration-200 group-hover:bg-destructive/12">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none text-destructive">
                {formatCurrency(funds.overduePayable, 'CNY')}
              </div>
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
                商品总数
              </CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <Package className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[1.75rem] font-bold tabular-nums tracking-tight leading-none">
                {inventory.totalItems}
              </div>
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
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 月度趋势图 */}
      <section aria-label="月度销售趋势" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">月度销售趋势</h2>
        <Card className="border-border/40">
          <CardContent className="pt-6">
            {trends.monthlySales.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <span className="rounded-full bg-muted/50 p-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
                </span>
                <p className="text-sm text-muted-foreground/60">暂无近 6 个月销售趋势数据</p>
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
                        valueFormatter={(v) => `$${Number(v).toLocaleString()}`}
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
