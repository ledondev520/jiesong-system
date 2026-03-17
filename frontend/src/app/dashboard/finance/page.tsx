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
import { DollarSign, ArrowDownLeft, ArrowUpRight, Wallet, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { financeService } from '@/services/finance.service';

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
        const response = await financeService.getStats();
        setStats(response);
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
      variant: 'text-primary',
    },
    {
      title: '待付账款',
      value: `¥${(stats?.payable?.unpaid ?? 0).toLocaleString()}`,
      icon: Wallet,
      description: '尚未支付给供应商',
      variant: 'text-destructive',
    },
    {
      title: '应收账款总额',
      value: `$${(stats?.receivable?.total ?? 0).toLocaleString()}`,
      icon: ArrowDownLeft,
      description: `已收: $${(stats?.receivable?.received ?? 0).toLocaleString()}`,
      variant: 'text-primary',
    },
    {
      title: '待收账款',
      value: `$${(stats?.receivable?.unreceived ?? 0).toLocaleString()}`,
      icon: DollarSign,
      description: '待从门店收回',
      variant: 'text-primary',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="财务管理"
        description="资金流水与应收应付概览。"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-10">
              <Link href="/dashboard/finance/payable">查看应付</Link>
            </Button>
            <Button asChild className="h-10">
              <Link href="/dashboard/finance/receivable">查看应收</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="kpi-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.variant || 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold tabular-nums ${stat.variant || ''}`}>{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 空状态：所有数据均为 0 时显示引导操作，否则显示账期说明 */}
      {stats &&
      stats.payable.total === 0 &&
      stats.receivable.total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">暂无财务记录</p>
            <p className="text-xs text-muted-foreground">
              导入采购或销售合同数据后，应付 / 应收账款将自动汇总显示在此。
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/finance/payable">查看应付明细</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/finance/receivable">查看应收明细</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">账款说明：</span>
          应付账款为人民币（¥），应收账款为美元（$）。点击上方按钮可查看逐笔明细。
        </div>
      )}
    </div>
  );
}
