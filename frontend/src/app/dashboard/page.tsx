/**
 * Input: 后端 dashboard API、opsExecutionService（未发货/采购清单）
 * Output: 工作台页面（高频动作 + 数据看板 + 经营执行）
 * Pos: 系统首页，提供经营概览、快速入口与执行工具
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ShoppingCart, TrendingUp, ClipboardList, Wallet, PackageSearch } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataDashboard } from '@/components/dashboard/DataDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnshippedListTab } from './ops-execution/components/UnshippedListTab';
import { PurchaseChecklistTab } from './ops-execution/components/PurchaseChecklistTab';

const quickActions = [
  { label: '新建采购', icon: ShoppingCart, href: '/dashboard/purchase/create', primary: true, desc: '录入采购合同' },
  { label: '新建出口', icon: TrendingUp, href: '/dashboard/sales/create', primary: true, desc: '创建出口合同' },
  { label: '采购合同', icon: ClipboardList, href: '/dashboard/contracts', primary: false, desc: '查看采购履约' },
  { label: '收付款', icon: Wallet, href: '/dashboard/payments', primary: false, desc: '跟进回款与付款' },
];

/**
 * 职责：渲染工作台首页（含经营执行区块）
 * 思路：
 *  0. 高频动作入口
 *  1. 数据看板（趋势/焦点/风险）
 *  2. 经营执行（未发货清单 + 门店采购清单）
 */
export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="工作台"
        description="经营概览与日常执行"
        showBack={false}
      />

      <section aria-label="高频动作">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className={cn(
                  'flex flex-col items-start gap-3 rounded-2xl border border-border p-4',
                  'bg-card text-card-foreground shadow-sm',
                  'hover:bg-muted/50 active:scale-[0.97] transition-all touch-manipulation',
                  'min-h-[80px] md:min-h-[96px]',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl',
                    action.primary ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
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

      <DataDashboard />

      {/* 经营执行 */}
      <section aria-label="经营执行">
        <h2 className="text-lg font-semibold mb-4">经营执行</h2>
        <Tabs defaultValue="unshipped" className="space-y-4">
          <TabsList className="border bg-background">
            <TabsTrigger value="unshipped" className="gap-2">
              <PackageSearch className="h-4 w-4" />
              未发货清单
            </TabsTrigger>
            <TabsTrigger value="purchase-checklist" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              门店采购清单
            </TabsTrigger>
          </TabsList>
          <TabsContent value="unshipped">
            <UnshippedListTab />
          </TabsContent>
          <TabsContent value="purchase-checklist">
            <PurchaseChecklistTab />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
