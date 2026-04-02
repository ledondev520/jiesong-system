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
      <div className="grid gap-6">
        <section className="space-y-3" aria-labelledby="dashboard-focus-heading">
          <h2 id="dashboard-focus-heading" className="text-base font-semibold text-foreground">当前焦点</h2>
          <Card>
            <CardContent className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </section>
        <section className="space-y-3" aria-labelledby="dashboard-risk-heading">
          <h2 id="dashboard-risk-heading" className="text-base font-semibold text-foreground">风险提醒</h2>
          <Card>
            <CardContent className="h-24 animate-pulse rounded-xl bg-muted/40" />
          </Card>
        </section>
        <section className="space-y-3" aria-labelledby="dashboard-trend-heading">
          <h2 id="dashboard-trend-heading" className="text-base font-semibold text-foreground">关键趋势</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="h-56 animate-pulse rounded-xl bg-muted/40" /></Card>
            <Card><CardContent className="h-56 animate-pulse rounded-xl bg-muted/40" /></Card>
          </div>
        </section>
      </div>
    );
  }

  if (error || !data) {
    return (
      <section className="space-y-3" aria-labelledby="dashboard-focus-heading">
        <h2 id="dashboard-focus-heading" className="text-base font-semibold text-foreground">当前焦点</h2>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">数据加载失败，请重试</p>
            <Button variant="outline" size="sm" onClick={fetchData}>重新加载</Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const focus = deriveFocusSummary(data);
  const risks = deriveRiskItems(data);

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="dashboard-focus-heading">
        <h2 id="dashboard-focus-heading" className="text-base font-semibold text-foreground">当前焦点</h2>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background px-3 py-1 text-xs font-medium text-primary">
                <ArrowUpRight className="h-3.5 w-3.5" />
                今日优先事项
              </div>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">{focus.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{focus.description}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {focus.metrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border bg-background/80 p-4">
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{metric.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="dashboard-risk-heading">
        <h2 id="dashboard-risk-heading" className="text-base font-semibold text-foreground">风险提醒</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {risks.length > 0 ? (
            risks.map((risk) => (
              <Card key={`${risk.title}-${risk.value}`}>
                <CardContent className="flex items-start gap-3 pt-6">
                  <span className={risk.tone === 'high' ? 'mt-0.5 text-destructive' : 'mt-0.5 text-amber-600'}>
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{risk.title}</p>
                    <p className="text-sm text-muted-foreground">{risk.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="flex items-center gap-3 pt-6 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>当前没有需要立即处理的经营风险</span>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="dashboard-trend-heading">
        <h2 id="dashboard-trend-heading" className="text-base font-semibold text-foreground">关键趋势</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">月度出货趋势</CardTitle>
              <CardDescription>最近 6 个月合同数量变化</CardDescription>
            </CardHeader>
            <CardContent>
              {data.shipments.monthly.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">暂无出货趋势数据</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={[...data.shipments.monthly].reverse()}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} tickFormatter={(v) => v.substring(5)} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip formatter={(value) => [`${value} 份`, '合同数量']} labelFormatter={(label) => `${label}`} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="var(--chart-3)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--chart-3)', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">热门采购商品</CardTitle>
              <CardDescription>按采购次数排序，保留最核心的商品趋势。</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topProducts.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">暂无商品数据</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topProducts.slice(0, 6)}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="productName"
                      tick={{ fontSize: 10 }}
                      height={60}
                      interval={0}
                      tickFormatter={(v) => v.length > 6 ? `${v.substring(0, 6)}..` : v}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        name === 'count' ? `${value} 次` : Number(value || 0).toLocaleString(),
                        name === 'count' ? '采购次数' : '采购数量',
                      ]}
                    />
                    <Legend formatter={(value) => (value === 'count' ? '采购次数' : '采购数量')} />
                    <Bar yAxisId="left" dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} name="count" />
                    <Bar yAxisId="right" dataKey="quantity" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="quantity" opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">采购合同</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{data.contracts.purchase.count}</div>
              <p className="text-xs text-muted-foreground">总金额: {formatAmount(data.contracts.purchase.totalAmount, 'CNY')}</p>
            </CardContent>
          </Card>

          <Card className="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">销售合同</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{data.contracts.sales.count}</div>
              <p className="text-xs text-muted-foreground">总金额: {formatAmount(data.contracts.sales.totalAmount, 'USD')}</p>
            </CardContent>
          </Card>

          <Card className="kpi-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">库存概览</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{data.inventory.productCount}</div>
              <p className="text-xs text-muted-foreground">库存记录: {data.inventory.recordCount} 条</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
