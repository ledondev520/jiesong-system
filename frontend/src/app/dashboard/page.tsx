/**
 * Input: 后端dashboard API、AI greeting API
 * Output: 工作台页面（系统核心入口，含AI问候语）
 * Pos: 系统首页，提供快速录入、待办事项、数据概览、AI问候语
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  AlertTriangle,
  Container,
  Warehouse,
  Loader2,
  Plus,
  ArrowRight,
  DollarSign,
  Ship,
  FileText,
} from 'lucide-react';
import api from '@/lib/axios';
import { ProductTracker } from '@/components/tools/ProductTracker';
import { AIGreeting } from '@/components/ai/AIGreeting';

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

/**
 * 职责：渲染工作台首页
 * 思路：
 *   1. 顶部快速录入区（一键开始工作）
 *   2. 待办事项区（提醒用户待处理任务）
 *   3. 数据概览（关键指标）
 */
export default function DashboardPage() {
  const router = useRouter();
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

  // 快速录入入口配置（采购 + 销售/货柜）
  const quickActions = [
    { 
      label: '新建采购', 
      icon: ShoppingCart, 
      href: '/dashboard/purchase/create',
      color: 'bg-blue-500 hover:bg-blue-600',
      desc: '录入采购合同'
    },
    { 
      label: '新建销售', 
      icon: TrendingUp, 
      href: '/dashboard/sales/create',
      color: 'bg-green-500 hover:bg-green-600',
      desc: '创建出口合同'
    },
  ];

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

  // 待办事项（点击跳转到筛选后的列表）
  const todoItems = [
    { 
      label: '采购待付款', 
      count: stats?.alerts?.pendingPurchases || 0, 
      href: '/dashboard/contracts?tab=purchase&status=SIGNED',  // 已签约待付款的采购合同
      icon: DollarSign,
    },
    { 
      label: '待发货柜', 
      count: stats?.recent?.containers?.filter(c => c.status === 'PENDING').length || 0, 
      href: '/dashboard/contracts?tab=sales&status=PACKING',  // 装箱中的货柜
      icon: Ship,
    },
    { 
      label: '库存待入库', 
      count: stats?.overview?.inventories || 0, 
      href: '/dashboard/inventory-container?status=PENDING',  // 待入库的库存
      icon: Warehouse,
    },
  ];

  return (
    <div className="space-y-6">
      {/* AI问候语悬浮卡片 */}
      <AIGreeting />

      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">工作台</h2>
        <p className="text-muted-foreground">欢迎回来，开始今天的工作</p>
      </div>

      {/* 快速录入区 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            快速录入
          </CardTitle>
          <CardDescription>一键开始录入新数据</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  className={`h-auto py-4 flex-col gap-2 ${action.color} text-white`}
                  onClick={() => router.push(action.href)}
                >
                  <Icon className="h-6 w-6" />
                  <span className="font-medium">{action.label}</span>
                  <span className="text-xs opacity-80">{action.desc}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 待办事项 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              待办事项
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3">
            {todoItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => router.push(item.href)}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${item.count > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                      {item.count}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 商品追踪 */}
      <ProductTracker />

      {/* 数据概览 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">采购合同</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overview?.purchaseContracts || 0}</div>
            <p className="text-xs text-muted-foreground">待处理: {stats?.alerts?.pendingPurchases || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">销售合同</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overview?.salesContracts || 0}</div>
            <p className="text-xs text-muted-foreground">进行中: {stats?.alerts?.activeSales || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">库存商品</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overview?.products || 0}</div>
            <p className="text-xs text-muted-foreground">库存记录: {stats?.overview?.inventories || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">货柜</CardTitle>
            <Container className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overview?.containers || 0}</div>
            <p className="text-xs text-muted-foreground">总数</p>
          </CardContent>
        </Card>
      </div>
      
      {/* 最近动态 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 最近货柜 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Container className="h-4 w-4 text-orange-500" />
                最近货柜
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/contracts?tab=sales')}>
                查看全部 <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!stats?.recent?.containers?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无货柜记录</p>
            ) : (
              <div className="space-y-2">
                {stats.recent.containers.slice(0, 3).map((container) => (
                  <div key={container.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{container.containerNo}</p>
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
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                最近销售
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/contracts?tab=sales')}>
                查看全部 <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!stats?.recent?.sales?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无销售记录</p>
            ) : (
              <div className="space-y-2">
                {stats.recent.sales.slice(0, 3).map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{sale.contractNo}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.signedAt ? new Date(sale.signedAt).toLocaleDateString('zh-CN') : '未签订'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm text-green-600">
                        ${sale.totalAmount?.toLocaleString() || '0'}
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
    </div>
  );
}
