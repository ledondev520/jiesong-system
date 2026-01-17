/**
 * Input: 后端dashboard API
 * Output: 工作台页面
 * Pos: 系统首页，展示数据概览和统计
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  AlertTriangle,
  Building2,
  Store,
  Container,
  Warehouse,
  Loader2,
} from 'lucide-react';
import api from '@/lib/axios';

interface DashboardStats {
  overview: {
    products: number;
    suppliers: number;
    stores: number;
    containers: number;
    inventories: number;
    salesContracts: number;
    purchaseContracts: number;
  };
  alerts: {
    pendingPurchases: number;
    activeSales: number;
    lowInventory: number;
  };
  recent: {
    containers: Array<{
      id: string;
      containerNo: string;
      status: string;
      shippedAt: string | null;
      createdAt: string;
    }>;
    sales: Array<{
      id: string;
      contractNo: string;
      totalAmount: number;
      status: string;
      signedAt: string | null;
    }>;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats');
        setStats((response as { data: DashboardStats }).data);
      } catch (err) {
        console.error('获取仪表盘数据失败:', err);
        setError('加载数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载中...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error || '数据加载失败'}
      </div>
    );
  }

  const overviewCards = [
    {
      title: '商品总数',
      value: stats.overview.products,
      icon: Package,
      color: 'text-blue-500',
    },
    {
      title: '供应商',
      value: stats.overview.suppliers,
      icon: Building2,
      color: 'text-green-500',
    },
    {
      title: '门店',
      value: stats.overview.stores,
      icon: Store,
      color: 'text-purple-500',
    },
    {
      title: '货柜',
      value: stats.overview.containers,
      icon: Container,
      color: 'text-orange-500',
    },
  ];

  const alertCards = [
    {
      title: '待处理采购',
      value: stats.alerts.pendingPurchases,
      icon: ShoppingCart,
      description: '需要处理的采购订单',
    },
    {
      title: '进行中销售',
      value: stats.alerts.activeSales,
      icon: TrendingUp,
      description: '正在进行的销售合同',
    },
    {
      title: '低库存预警',
      value: stats.alerts.lowInventory,
      icon: AlertTriangle,
      description: '库存不足需补货',
      variant: 'destructive' as const,
    },
    {
      title: '库存记录',
      value: stats.overview.inventories,
      icon: Warehouse,
      description: '总库存记录数',
    },
  ];

  const statusMap: Record<string, string> = {
    PENDING: '待发货',
    SHIPPING: '运输中',
    SHIPPED: '已发货',
    ARRIVED: '已到港',
    CLEARED: '已清关',
    COMPLETED: '已完成',
    DRAFT: '草稿',
    CANCELLED: '已取消',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">工作台</h2>
        <p className="text-muted-foreground">
          查看库存概览与销售业绩
        </p>
      </div>

      {/* 数据概览 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 业务指标 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {alertCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className={card.variant === 'destructive' && card.value > 0 ? 'border-red-500/50' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.variant === 'destructive' && card.value > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.variant === 'destructive' && card.value > 0 ? 'text-red-500' : ''}`}>
                  {card.value}
                </div>
                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* 最近动态 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 最近货柜 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Container className="h-5 w-5 text-orange-500" />
              最近货柜
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recent.containers.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无货柜记录</p>
            ) : (
              <div className="space-y-3">
                {stats.recent.containers.map((container) => (
                  <div key={container.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{container.containerNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {container.shippedAt ? new Date(container.shippedAt).toLocaleDateString('zh-CN') : '未发货'}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      container.status === 'SHIPPED' ? 'bg-green-100 text-green-700' :
                      container.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {statusMap[container.status] || container.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近销售 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              最近销售合同
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recent.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无销售记录</p>
            ) : (
              <div className="space-y-3">
                {stats.recent.sales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{sale.contractNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.signedAt ? new Date(sale.signedAt).toLocaleDateString('zh-CN') : '未签订'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        ¥{sale.totalAmount?.toLocaleString() || '0'}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        sale.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        sale.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {statusMap[sale.status] || sale.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 合同统计 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>销售合同总数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600">
              {stats.overview.salesContracts}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              进行中: {stats.alerts.activeSales}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>采购合同总数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-600">
              {stats.overview.purchaseContracts}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              待处理: {stats.alerts.pendingPurchases}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
