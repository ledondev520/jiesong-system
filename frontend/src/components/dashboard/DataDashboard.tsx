/**
 * Input: 后端 dashboard/analytics API
 * Output: 数据看板组件（合同统计、应收账款、库存、出货趋势、热门商品）
 * Pos: 工作台子组件，展示关键业务指标
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  TrendingUp,
  Package,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { aiService, type DashboardAnalytics } from '@/services/ai.service';
import { errorLogger } from '@/lib/error-logger';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type FocusSummary = {
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string }>;
};

type RiskItem = {
  title: string;
  value: string;
  tone: 'high' | 'medium' | 'low';
};

const formatAmount = (amount: number, currency: 'CNY' | 'USD') =>
  `${currency === 'CNY' ? '¥' : '$'}${amount.toLocaleString()}`;

const deriveFocusSummary = (data: DashboardAnalytics): FocusSummary => {
  if (data.contracts.sales.receivable > 0) {
    return {
      title: '优先处理回款',
      description: '销售侧仍有未回款项，优先跟进收款进度，避免现金流继续占压。',
      metrics: [
        { label: '待收金额', value: formatAmount(data.contracts.sales.receivable, 'USD') },
        { label: '销售合同', value: `${data.contracts.sales.count} 份` },
        { label: '商品在库', value: `${data.inventory.productCount} 种` },
      ],
    };
  }

  if (data.contracts.purchase.unpaidAmount > 0) {
    return {
      title: '优先处理待付款采购',
      description: '采购侧仍有待付款项，优先确认付款节奏与到货安排，避免履约阻塞。',
      metrics: [
        { label: '待付金额', value: formatAmount(data.contracts.purchase.unpaidAmount, 'CNY') },
        { label: '采购合同', value: `${data.contracts.purchase.count} 份` },
        { label: '库存记录', value: `${data.inventory.recordCount} 条` },
      ],
    };
  }

  return {
    title: '今日经营平稳，进入执行动作',
    description: '当前没有突出的收付压力，优先处理合同推进、库存协同与日常履约。',
    metrics: [
      { label: '采购合同', value: `${data.contracts.purchase.count} 份` },
      { label: '销售合同', value: `${data.contracts.sales.count} 份` },
      { label: '库存记录', value: `${data.inventory.recordCount} 条` },
    ],
  };
};

const deriveRiskItems = (data: DashboardAnalytics): RiskItem[] => {
  const risks: RiskItem[] = [];

  if (data.contracts.sales.receivable > 0) {
    risks.push({
      title: '待收回款',
      value: formatAmount(data.contracts.sales.receivable, 'USD'),
      tone: 'high',
    });
  }

  if (data.contracts.purchase.unpaidAmount > 0) {
    risks.push({
      title: '采购待付',
      value: formatAmount(data.contracts.purchase.unpaidAmount, 'CNY'),
      tone: 'medium',
    });
  }

  const hasOperationalActivity =
    data.contracts.purchase.count > 0 ||
    data.contracts.sales.count > 0 ||
    data.inventory.recordCount > 0 ||
    data.topProducts.length > 0 ||
    data.storeStats.length > 0;

  if (hasOperationalActivity && data.shipments.monthly.length === 0) {
    risks.push({
      title: '出货趋势',
      value: '暂无近 6 个月出货数据',
      tone: 'low',
    });
  }

  return risks;
};

/**
 * 职责：渲染数据看板
 * 思路：把 dashboard analytics 收口成焦点、风险与趋势三个区域
 */
export function DataDashboard() {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await aiService.getDashboardAnalytics();
      setData(res.data);
    } catch (e) {
      errorLogger.error('DataDashboard', e);
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
      <div className="space-y-8">
        <section className="space-y-3" aria-labelledby="dashboard-focus-heading">
          <h3 id="dashboard-focus-heading" className="text-sm font-semibold text-foreground">优先处理</h3>
          <Card className="border-border/40">
            <CardContent className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
            </CardContent>
          </Card>
        </section>
        <section className="space-y-3" aria-labelledby="dashboard-risk-heading">
          <h3 id="dashboard-risk-heading" className="text-sm font-semibold text-foreground">需关注</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card className="border-border/40"><CardContent className="h-24 animate-pulse rounded-xl bg-muted/30" /></Card>
            <Card className="border-border/40"><CardContent className="h-24 animate-pulse rounded-xl bg-muted/30" /></Card>
          </div>
        </section>
        <section className="space-y-3" aria-labelledby="dashboard-trend-heading">
          <h3 id="dashboard-trend-heading" className="text-sm font-semibold text-foreground">经营趋势</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/40"><CardContent className="h-60 animate-pulse rounded-xl bg-muted/30" /></Card>
            <Card className="border-border/40"><CardContent className="h-60 animate-pulse rounded-xl bg-muted/30" /></Card>
          </div>
        </section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <section className="space-y-3" aria-labelledby="dashboard-focus-heading">
        <h3 id="dashboard-focus-heading" className="text-sm font-semibold text-foreground">优先处理</h3>
        <Card className="border-border/40">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <span className="rounded-full bg-muted/60 p-4">
              <AlertCircle className="h-6 w-6 text-muted-foreground/70" />
            </span>
            <p className="text-sm text-muted-foreground/80">数据加载失败，请重试</p>
            <Button variant="outline" size="sm" className="rounded-lg h-9 px-4" onClick={fetchData}>重新加载</Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const focus = deriveFocusSummary(data);
  const risks = deriveRiskItems(data);

  return (
    <div className="space-y-8">
      {/* 优先处理 */}
      <section className="space-y-4" aria-labelledby="dashboard-focus-heading">
        <h3 id="dashboard-focus-heading" className="text-sm font-semibold text-foreground">优先处理</h3>
        <Card className="group relative overflow-hidden border-primary/10 bg-primary/[0.03] transition-all duration-300 hover:border-primary/18 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-px bg-primary/15" />
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/[0.05] blur-3xl transition-opacity group-hover:opacity-100" />

          <CardContent className="relative grid gap-6 pt-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-background/70 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm">
                <ArrowUpRight className="h-3.5 w-3.5" />
                今日优先事项
              </div>
              <div>
                <h3 className="text-[1.35rem] font-bold tracking-tight text-foreground">{focus.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground/80">{focus.description}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {focus.metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-border/40 bg-background/60 p-4 transition-all duration-200 hover:border-primary/15 hover:bg-background/80 hover:shadow-sm">
                  <p className="text-xs font-medium text-muted-foreground/80">{metric.label}</p>
                  <p className="mt-2 text-xl font-bold tabular-nums tracking-tight text-foreground">{metric.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 需关注 */}
      <section className="space-y-4" aria-labelledby="dashboard-risk-heading">
        <h3 id="dashboard-risk-heading" className="text-sm font-semibold text-foreground">需关注</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {risks.length > 0 ? (
            risks.map((risk) => (
              <Card key={`${risk.title}-${risk.value}`} className="group border-border/40 transition-all duration-200 hover:border-border/60 hover:shadow-sm">
                <CardContent className="flex items-start gap-3.5 pt-6">
                  <span className={
                    risk.tone === 'high'
                      ? 'mt-0.5 rounded-xl bg-destructive/8 p-2 text-destructive ring-1 ring-destructive/15'
                      : 'mt-0.5 rounded-xl bg-amber-500/8 p-2 text-amber-600 ring-1 ring-amber-500/15'
                  }>
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{risk.title}</p>
                    <p className="text-sm text-muted-foreground/80">{risk.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="md:col-span-2 xl:col-span-3 border-border/40">
              <CardContent className="flex items-center gap-3.5 pt-6 text-sm text-muted-foreground/80">
                <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/15">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span>当前没有需要立即处理的经营风险</span>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* 经营趋势 */}
      <section className="space-y-4" aria-labelledby="dashboard-trend-heading">
        <h3 id="dashboard-trend-heading" className="text-sm font-semibold text-foreground">经营趋势</h3>
        
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">月度出货趋势</CardTitle>
              <CardDescription className="text-xs text-muted-foreground/70">最近 6 个月合同数量变化</CardDescription>
            </CardHeader>
            <CardContent>
              {data.shipments.monthly.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <span className="rounded-full bg-muted/50 p-3">
                    <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
                  </span>
                  <p className="text-sm text-muted-foreground/60">暂无出货趋势数据</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={[...data.shipments.monthly].reverse()}>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => v.substring(5)} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '13px' }}
                      formatter={(value) => [`${value} 份`, '合同数量']} 
                      labelFormatter={(label) => `${label}`} 
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="var(--chart-3)"
                      strokeWidth={2.5}
                      dot={{ fill: 'var(--chart-3)', r: 5, strokeWidth: 2, stroke: 'var(--background)' }}
                      activeDot={{ r: 7, strokeWidth: 2, stroke: 'var(--background)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">热门采购商品</CardTitle>
              <CardDescription className="text-xs text-muted-foreground/70">按采购次数排序，保留最核心的商品趋势。</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <span className="rounded-full bg-muted/50 p-3">
                    <Package className="h-5 w-5 text-muted-foreground/50" />
                  </span>
                  <p className="text-sm text-muted-foreground/60">暂无商品数据</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topProducts.slice(0, 6)} barGap={6}>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
                    <XAxis
                      dataKey="productName"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      height={55}
                      interval={0}
                      tickFormatter={(v) => v.length > 5 ? `${v.substring(0, 5)}..` : v}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '13px' }}
                      formatter={(value, name) => [
                        name === 'count' ? `${value} 次` : Number(value || 0).toLocaleString(),
                        name === 'count' ? '采购次数' : '采购数量',
                      ]}
                    />
                    <Legend formatter={(value) => (value === 'count' ? '采购次数' : '采购数量')} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="count" fill="var(--chart-3)" radius={[6, 6, 0, 0]} name="count" barSize={20} />
                    <Bar yAxisId="right" dataKey="quantity" fill="var(--chart-1)" radius={[6, 6, 0, 0]} name="quantity" opacity={0.65} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* KPI 概览 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">采购合同</CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <FileText className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[2rem] font-bold tabular-nums tracking-tight leading-none">{data.contracts.purchase.count}</div>
              <p className="mt-2 text-xs font-medium text-muted-foreground/70">总金额 {formatAmount(data.contracts.purchase.totalAmount, 'CNY')}</p>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">销售合同</CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <TrendingUp className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[2rem] font-bold tabular-nums tracking-tight leading-none">{data.contracts.sales.count}</div>
              <p className="mt-2 text-xs font-medium text-muted-foreground/70">总金额 {formatAmount(data.contracts.sales.totalAmount, 'USD')}</p>
            </CardContent>
          </Card>

          <Card className="kpi-card group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">库存概览</CardTitle>
              <span className="rounded-xl bg-primary/8 p-2 text-primary ring-1 ring-primary/12 transition-all duration-200 group-hover:bg-primary/12">
                <Package className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-[2rem] font-bold tabular-nums tracking-tight leading-none">{data.inventory.productCount}</div>
              <p className="mt-2 text-xs font-medium text-muted-foreground/70">库存记录 {data.inventory.recordCount} 条</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
