'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function FinancePage() {
  const stats = [
    {
      title: '应付账款 (Payable)',
      value: '¥125,000',
      icon: ArrowUpRight,
      description: '待支付给供应商',
      variant: 'text-orange-600',
    },
    {
      title: '应收账款 (Receivable)',
      value: '$85,000',
      icon: ArrowDownLeft,
      description: '待从门店收回',
      variant: 'text-blue-600',
    },
    {
      title: '本月支出',
      value: '¥22,000',
      icon: Wallet,
      description: '较上月减少 5%',
    },
    {
      title: '本月收入',
      value: '$45,000',
      icon: DollarSign,
      description: '较上月增加 12%',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">财务管理</h2>
          <p className="text-muted-foreground">资金流水与应收应付概览。</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/finance/payable">查看应付</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/finance/receivable">查看应收</Link>
          </Button>
        </div>
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
                <Icon className={`h-4 w-4 text-muted-foreground ${stat.variant || ''}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.variant || ''}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>近期流水</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground text-center py-10">
              暂无交易记录。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
