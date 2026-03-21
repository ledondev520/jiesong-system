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
  DollarSign,
  TrendingUp,
  Package,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { aiService, type DashboardAnalytics } from '@/services/ai.service';
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

/**
 * 职责：渲染数据看板
 * 思路：展示关键业务指标卡片和图表
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
      console.error('获取分析数据失败:', e);
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
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">数据加载失败，请重试</p>
          <Button variant="outline" size="sm" onClick={fetchData}>重新加载</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 核心指标卡片 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 采购合同 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">采购合同</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{data.contracts.purchase.count}</div>
            {data.contracts.purchase.totalAmount > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  总金额: ¥{data.contracts.purchase.totalAmount.toLocaleString()}
                </p>
                <p className="text-xs text-primary/80">
                  待付: ¥{data.contracts.purchase.unpaidAmount.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">共 {data.contracts.purchase.count} 份合同</p>
            )}
          </CardContent>
        </Card>

        {/* 销售合同 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">销售合同</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{data.contracts.sales.count}</div>
            {data.contracts.sales.totalAmount > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  总金额: ${data.contracts.sales.totalAmount.toLocaleString()}
                </p>
                <p className="text-xs text-primary/80">
                  已收: ${data.contracts.sales.receivedAmount.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">共 {data.contracts.sales.count} 份合同</p>
            )}
          </CardContent>
        </Card>

        {/* 应收账款 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">应收账款</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {data.contracts.sales.receivable > 0 ? (
              <>
                <div className="text-3xl font-bold tabular-nums">
                  ${data.contracts.sales.receivable.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">待收回美金</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground">暂无待收款项</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 库存概览 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">库存概览</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{data.inventory.productCount}</div>
            <p className="text-xs text-muted-foreground">
              商品种类
            </p>
            <p className="text-xs text-primary/80">
              库存记录: {data.inventory.recordCount}条
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 图表区域 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 月度出货趋势（折线图） */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">月度出货趋势</CardTitle>
            <CardDescription>最近6个月合同数量</CardDescription>
          </CardHeader>
          <CardContent>
            {data.shipments.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">暂无出货数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={[...data.shipments.monthly].reverse()}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 12 }} 
                    tickFormatter={(v) => v.substring(5)}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    formatter={(value) => [`${value} 份`, '合同数量']}
                    labelFormatter={(label) => `${label}`}
                  />
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

        {/* 门店采购排行（柱形图） */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">门店采购排行</CardTitle>
            <CardDescription>Top 5 门店采购数量</CardDescription>
          </CardHeader>
          <CardContent>
            {data.storeStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">暂无门店数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.storeStats.slice(0, 5)} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="storeName" 
                    width={80}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.length > 8 ? v.substring(0, 8) + '...' : v}
                  />
                  <Tooltip 
                    formatter={(value) => [Number(value || 0).toLocaleString(), '采购数量']}
                  />
                  <Bar 
                    dataKey="quantity" 
                    fill="var(--chart-1)" 
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

        {/* 热门商品（柱形图） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">热门采购商品 Top 10</CardTitle>
          <CardDescription>按采购次数排序（含数量）</CardDescription>
        </CardHeader>
        <CardContent>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">暂无商品数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topProducts.slice(0, 10)}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis 
                  dataKey="productName" 
                  tick={{ fontSize: 10 }}
                  height={60}
                  interval={0}
                  tickFormatter={(v) => v.length > 6 ? v.substring(0, 6) + '..' : v}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'count' ? `${value} 次` : Number(value || 0).toLocaleString(),
                    name === 'count' ? '采购次数' : '采购数量',
                  ]}
                />
                <Legend formatter={(value) => value === 'count' ? '采购次数' : '采购数量'} />
                <Bar yAxisId="left" dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} name="count" />
                <Bar yAxisId="right" dataKey="quantity" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="quantity" opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
