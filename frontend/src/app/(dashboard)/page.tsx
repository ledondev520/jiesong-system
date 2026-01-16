'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, TrendingUp, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  const stats = [
    {
      title: 'Total Products',
      value: '1,234',
      icon: Package,
      description: '+12% from last month',
    },
    {
      title: 'Pending Purchases',
      value: '23',
      icon: ShoppingCart,
      description: '5 urgent',
    },
    {
      title: 'Active Sales',
      value: '45',
      icon: TrendingUp,
      description: '+15% from last month',
    },
    {
      title: 'Low Stock Items',
      value: '12',
      icon: AlertTriangle,
      description: 'Needs reorder',
      variant: 'destructive',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your inventory and sales performance.
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
      
      {/* Placeholder for Recent Activity or Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No recent sales.</p>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground">System initialized.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
