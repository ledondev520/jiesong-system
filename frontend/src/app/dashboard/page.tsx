/**
 * Input: 后端dashboard API
 * Output: 工作台页面（系统核心入口，含快速录入、商品追踪、数据看板）
 * Pos: 系统首页，提供快速录入、商品追踪、数据看板
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ModuleTabHeader, OPERATIONS_TABS } from '@/components/layout/ModuleTabHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShoppingCart, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { ProductTracker } from '@/components/tools/ProductTracker';
import { PageHeader } from '@/components/layout/PageHeader';

const DataDashboard = dynamic(
  () => import('@/components/dashboard/DataDashboard').then((module) => module.DataDashboard),
  {
    ssr: false,
    loading: () => <DashboardAnalyticsSkeleton />,
  },
);

function DashboardAnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`kpi-skeleton-${index}`} className="kpi-card">
            <CardHeader className="space-y-3 pb-2">
              <div className="h-4 w-24 rounded-full bg-muted animate-pulse" />
              <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-10 w-16 rounded-xl bg-muted animate-pulse" />
              <div className="h-3 w-28 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={`chart-skeleton-${index}`}>
            <CardHeader className="space-y-3 pb-3">
              <div className="h-5 w-28 rounded-full bg-muted animate-pulse" />
              <div className="h-4 w-40 rounded-full bg-muted animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-[200px] rounded-2xl border border-dashed border-border/70 bg-muted/40 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="h-5 w-32 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-52 rounded-full bg-muted animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] rounded-2xl border border-dashed border-border/70 bg-muted/40 animate-pulse" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 职责：渲染工作台首页
 * 思路：
 *   1. 顶部快速录入区（一键开始工作）
 *   2. 商品追踪（查询商品出货状态）
 *   3. 数据看板（关键业务指标）
 */
export default function DashboardPage() {
  const router = useRouter();

  // 快速录入入口配置
  const quickActions = [
    { 
      label: '新建采购', 
      icon: ShoppingCart, 
      href: '/dashboard/purchase/create',
      tone: 'primary',
      desc: '录入采购合同'
    },
    { 
      label: '新建销售', 
      icon: TrendingUp, 
      href: '/dashboard/sales/create',
      tone: 'secondary',
      desc: '创建出口合同'
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />

      <PageHeader
        title="工作台"
        description="查看关键经营指标，并从这里进入高频业务流程。"
        showBack={false}
      />

      {/* 快速录入区 */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5" />
            快速录入
          </CardTitle>
          <CardDescription>用统一入口创建采购和销售业务。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="h-auto min-h-20 items-start justify-start rounded-xl border border-border bg-background px-4 py-3 text-left shadow-none hover:bg-muted"
                  onClick={() => router.push(action.href)}
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg ring-1',
                        action.tone === 'primary'
                          ? 'bg-primary/10 text-primary ring-primary/20'
                          : 'bg-muted text-muted-foreground ring-border',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <span className="block font-medium text-foreground">{action.label}</span>
                    <span className="block text-xs text-muted-foreground">{action.desc}</span>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 商品追踪 */}
      <ProductTracker />

      {/* 数据看板 */}
      <DataDashboard />
    </div>
  );
}
