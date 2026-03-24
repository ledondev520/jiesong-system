/**
 * Input: 后端dashboard API
 * Output: 工作台页面（系统核心入口，含快速录入、商品追踪、数据看板）
 * Pos: 系统首页，提供快速录入、商品追踪、数据看板；移动端采用大图标快捷入口布局
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { ModuleTabHeader, OPERATIONS_TABS } from '@/components/layout/ModuleTabHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShoppingCart, TrendingUp, ClipboardList, Wallet, ArrowRight, Wrench } from 'lucide-react';
import { ProductTracker } from '@/components/tools/ProductTracker';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataDashboard } from '@/components/dashboard/DataDashboard';
import { useMobile } from '@/lib/hooks/useMobile';

/**
 * 职责：渲染工作台首页
 * 思路：
 *   1. 首屏先展示当前焦点 / 高频动作 / 风险提醒 / 关键趋势
 *   2. 工具型模块（如商品追踪）下沉为次级区域
 */
export default function DashboardPage() {
  const router = useRouter();
  const isMobile = useMobile();

  const quickActions = [
    {
      label: '新建采购',
      icon: ShoppingCart,
      href: '/dashboard/purchase/create',
      tone: 'primary',
      desc: '录入采购合同',
    },
    {
      label: '新建销售',
      icon: TrendingUp,
      href: '/dashboard/sales/create',
      tone: 'secondary',
      desc: '创建出口合同',
    },
    {
      label: '采购合同',
      icon: ClipboardList,
      href: '/dashboard/contracts',
      tone: 'secondary',
      desc: '查看采购履约',
    },
    {
      label: '收付管理',
      icon: Wallet,
      href: '/dashboard/payments',
      tone: 'primary',
      desc: '跟进回款与付款',
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />

      <PageHeader
        title="工作台"
        description="先看经营焦点与风险，再从高频动作进入当天执行。"
        showBack={false}
      />

      {/* 移动端：高频动作前置（拇指区域优先，减少滚动） */}
      {isMobile && (
        <section aria-label="高频动作">
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => router.push(action.href)}
                  className={cn(
                    'flex flex-col items-start gap-3 rounded-2xl border border-border p-4',
                    'bg-card text-card-foreground shadow-sm',
                    'active:scale-[0.97] transition-transform touch-manipulation',
                    'min-h-[88px]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl',
                      action.tone === 'primary'
                        ? 'bg-primary/12 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                    <span className="block text-xs text-muted-foreground">{action.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 数据看板区域 */}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <DataDashboard />

        {/* 桌面端高频动作 */}
        <Card className="hidden h-fit xl:block">
          <CardHeader className="space-y-2 border-b pb-4">
            <CardTitle className="text-base">高频动作</CardTitle>
            <CardDescription>保留最常用的业务入口，减少在侧边栏内来回切换。</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
      </div>

      {/* 经营工具（次级区域） */}
      <section className="space-y-3" aria-labelledby="dashboard-tools-heading">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h2 id="dashboard-tools-heading" className="text-base font-semibold text-foreground">
            经营工具
          </h2>
        </div>
        <CardDescription className="hidden md:block">将查询型工具下沉为次级区域，避免与首屏经营信号抢焦点。</CardDescription>
        <div>
          <ProductTracker />
        </div>
      </section>
    </div>
  );
}
