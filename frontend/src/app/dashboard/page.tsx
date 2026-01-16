'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, TrendingUp, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  const stats = [
    {
      title: '商品总数',
      value: '1,234',
      icon: Package,
      description: '较上月增长 12%',
    },
    {
      title: '待处理采购',
      value: '23',
      icon: ShoppingCart,
      description: '5 个紧急订单',
    },
    {
      title: '进行中销售',
      value: '45',
      icon: TrendingUp,
      description: '较上月增长 15%',
    },
    {
      title: '低库存预警',
      value: '12',
      icon: AlertTriangle,
      description: '需及时补货',
      variant: 'destructive',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">工作台</h2>
        <p className="text-muted-foreground">
          查看库存概览与销售业绩。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>近期销售</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">暂无近期销售记录。</p>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>最新动态</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground">系统初始化完成。</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
