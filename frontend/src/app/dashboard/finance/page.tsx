/**
 * Input: 后端finance API
 * Output: 财务管理页面
 * Pos: 财务概览页面，展示应收应付统计
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ArrowDownLeft, ArrowUpRight, Wallet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import api from '@/lib/axios';

interface FinanceStats {
  payable: {
    total: number;
    paid: number;
    unpaid: number;
  };
  receivable: {
    total: number;
    received: number;
    unreceived: number;
  };
}

export default function FinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/finance/stats');
        setStats((response as { data: FinanceStats }).data);
      } catch (error) {
        console.error('获取财务统计失败:', error);
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
        <span className="ml-2">加载中...</span>
      </div>
    );
  }

  const statCards = [
    {
      title: '应付账款总额',
      value: `¥${(stats?.payable?.total ?? 0).toLocaleString()}`,
      icon: ArrowUpRight,
      description: `已付: ¥${(stats?.payable?.paid ?? 0).toLocaleString()}`,
      variant: 'text-orange-600',
    },
    {
      title: '待付账款',
      value: `¥${(stats?.payable?.unpaid ?? 0).toLocaleString()}`,
      icon: Wallet,
      description: '尚未支付给供应商',
      variant: 'text-red-600',
    },
    {
      title: '应收账款总额',
      value: `$${(stats?.receivable?.total ?? 0).toLocaleString()}`,
      icon: ArrowDownLeft,
      description: `已收: $${(stats?.receivable?.received ?? 0).toLocaleString()}`,
      variant: 'text-blue-600',
    },
    {
      title: '待收账款',
      value: `$${(stats?.receivable?.unreceived ?? 0).toLocaleString()}`,
      icon: DollarSign,
      description: '待从门店收回',
      variant: 'text-green-600',
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
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.variant || 'text-muted-foreground'}`} />
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
            <CardTitle>财务说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>• <strong>应付账款</strong>：需要支付给供应商的采购金额</p>
              <p>• <strong>应收账款</strong>：待从美国门店收回的销售款项</p>
              <p>• 采购金额来自导入的CSV数据中的"采购金额"列</p>
              <p>• 点击"查看应付"或"查看应收"可查看详细明细</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
