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
  Ship,
  Store,
  Loader2,
  BarChart3,
} from 'lucide-react';
import api from '@/lib/axios';

interface AnalyticsData {
  contracts: {
    purchase: { count: number; totalAmount: number; paidAmount: number; unpaidAmount: number };
    sales: { count: number; totalAmount: number; receivedAmount: number; receivable: number };
  };
  inventory: { productCount: number; recordCount: number; totalQuantity: number };
  shipments: {
    monthly: Array<{ month: string; count: number; amount: number; boxes: number }>;
  };
  topProducts: Array<{ productName: string; count: number; quantity: number; totalAmount: number }>;
  storeStats: Array<{ storeName: string; orderCount: number; quantity: number; totalAmount: number }>;
}

/**
 * 职责：渲染数据看板
 * 思路：展示关键业务指标卡片和图表
 */
export function DataDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/dashboard/analytics');
        setData((res as { data: AnalyticsData }).data);
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* 采购合同 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">采购合同</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.contracts.purchase.count}</div>
            <p className="text-xs text-muted-foreground">
              总金额: ¥{data.contracts.purchase.totalAmount.toLocaleString()}
            </p>
            <p className="text-xs text-orange-500">
              待付: ¥{data.contracts.purchase.unpaidAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 销售合同 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">销售合同</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.contracts.sales.count}</div>
            <p className="text-xs text-muted-foreground">
              总金额: ${data.contracts.sales.totalAmount.toLocaleString()}
            </p>
            <p className="text-xs text-green-600">
              已收: ${data.contracts.sales.receivedAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* 应收账款 */}
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">应收账款</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              ${data.contracts.sales.receivable.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              待收回美金
            </p>
          </CardContent>
        </Card>

        {/* 库存概览 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">库存概览</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.inventory.productCount}</div>
            <p className="text-xs text-muted-foreground">
              商品种类
            </p>
            <p className="text-xs text-purple-600">
              库存记录: {data.inventory.recordCount}条
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 详细数据 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 出货统计 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="h-4 w-4 text-blue-500" />
              月度出货统计
            </CardTitle>
            <CardDescription>最近6个月</CardDescription>
          </CardHeader>
          <CardContent>
            {data.shipments.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无出货数据</p>
            ) : (
              <div className="space-y-3">
                {data.shipments.monthly.map((m) => (
                  <div key={m.month} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{m.month}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{m.count}单</span>
                      <span className="text-muted-foreground">{m.boxes || 0}箱</span>
                      <span className="font-medium text-green-600">
                        ${(m.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 门店统计 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4 text-purple-500" />
              门店采购排行
            </CardTitle>
            <CardDescription>按采购金额排序</CardDescription>
          </CardHeader>
          <CardContent>
            {data.storeStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无门店数据</p>
            ) : (
              <div className="space-y-2">
                {data.storeStats.slice(0, 5).map((s, i) => (
                  <div key={s.storeName} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-gray-100 text-gray-700' :
                        i === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-muted text-muted-foreground'
                      }`}>{i + 1}</span>
                      <span className="text-sm truncate max-w-[120px]">{s.storeName}</span>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      ${(s.totalAmount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 热门商品 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-green-500" />
            热门采购商品 Top 10
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无商品数据</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {data.topProducts.map((p, i) => (
                <div key={p.productName} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="text-sm truncate max-w-[140px]">{p.productName}</span>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-muted-foreground">{p.count}次</div>
                    <div className="text-green-600 font-medium">${(p.totalAmount || 0).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
