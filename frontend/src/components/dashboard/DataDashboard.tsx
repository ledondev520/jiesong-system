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
import {
  FileText,
  DollarSign,
  TrendingUp,
  Package,
  Loader2,
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await aiService.getDashboardAnalytics();
        setData(res.data);
      } catch (e) {
        console.error('获取分析数据失败:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* 核心指标卡片 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 采购合同 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">采购合同</CardTitle>
            <FileText className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.contracts.purchase.count}</div>
            <p className="text-xs text-muted-foreground">
              总金额: ¥{data.contracts.purchase.totalAmount.toLocaleString()}
            </p>
            <p className="text-xs text-chart-5">
              待付: ¥{data.contracts.purchase.unpaidAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 销售合同 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">销售合同</CardTitle>
            <TrendingUp className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.contracts.sales.count}</div>
            <p className="text-xs text-muted-foreground">
              总金额: ${data.contracts.sales.totalAmount.toLocaleString()}
            </p>
            <p className="text-xs text-chart-3">
              已收: ${data.contracts.sales.receivedAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 应收账款 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">应收账款</CardTitle>
            <DollarSign className="h-4 w-4 text-chart-5" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.contracts.sales.receivable.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              待收回美金
            </p>
          </CardContent>
        </Card>

        {/* 库存概览 */}
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">库存概览</CardTitle>
            <Package className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.inventory.productCount}</div>
            <p className="text-xs text-muted-foreground">
              商品种类
            </p>
            <p className="text-xs text-chart-4">
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
            <CardDescription>最近6个月出货金额</CardDescription>
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
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, '金额']}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
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
            <CardDescription>Top 5 门店采购金额</CardDescription>
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
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="storeName" 
                    width={80}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.length > 8 ? v.substring(0, 8) + '...' : v}
                  />
                  <Tooltip 
                    formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, '采购额']}
                  />
                  <Bar 
                    dataKey="totalAmount" 
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
          <CardDescription>按采购金额排序</CardDescription>
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
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'totalAmount' ? `$${Number(value || 0).toLocaleString()}` : value,
                    name === 'totalAmount' ? '金额' : '次数'
                  ]}
                />
                <Legend formatter={(value) => value === 'totalAmount' ? '采购金额' : '采购次数'} />
                <Bar dataKey="totalAmount" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
