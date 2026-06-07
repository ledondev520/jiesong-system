/**
 * Input: 后端 dashboard API、采购/出口列表、当前用户
 * Output: 经营中台工作台首页（跨业务指标、待办与快速动作）
 * Pos: 经营中台首页，作为业务执行摘要而不是重复模块入口
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Banknote,
  FileText,
  PackageCheck,
  Receipt,
  Ship,
  ShoppingCart,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, OPERATIONS_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PurchaseStatus, SalesContract, SalesStatus } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { salesService } from '@/services/sales.service';
import { financialStatementsService } from '@/services/financialStatements.service';
import { aiService } from '@/services/ai.service';
import { useAuthStore } from '@/store/auth.store';

type TaskItem = { id: string; contractNo?: string };

type DashboardMetrics = {
  draftPurchases: number;
  exportPendingParams: number;
  receivable: number;
  unpaidAmount: number;
  inventoryRecords: number;
  latestFinancePeriod: string | null;
};

const hasExportExecutionMetrics = (contract: Pick<SalesContract, 'status' | 'totalBoxes' | 'grossWeight' | 'volume'>) => {
  if (![SalesStatus.DRAFT, SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)) return false;
  return !(contract.totalBoxes > 0 && contract.grossWeight > 0 && contract.volume > 0);
};

const formatCurrency = (amount: number, currency: 'CNY' | 'USD') => {
  if (!amount) return currency === 'CNY' ? '¥0' : '$0';
  return `${currency === 'CNY' ? '¥' : '$'}${Math.round(amount).toLocaleString()}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    draftPurchases: 0,
    exportPendingParams: 0,
    receivable: 0,
    unpaidAmount: 0,
    inventoryRecords: 0,
    latestFinancePeriod: null,
  });
  const [draftTasks, setDraftTasks] = useState<TaskItem[]>([]);
  const [exportTasks, setExportTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      try {
        const [purchaseRes, salesRes, analyticsRes, periods] = await Promise.all([
          purchaseService.getAll({ page: 1, pageSize: 100, lite: true }),
          salesService.getAll({ page: 1, pageSize: 100, lite: true }),
          aiService.getDashboardAnalytics().catch(() => null),
          financialStatementsService.listStatements().catch(() => []),
        ]);
        if (!active) return;

        const purchases = purchaseRes.data?.items || [];
        const sales = salesRes.data?.items || [];
        const analytics = analyticsRes?.data;
        const draftPurchaseItems = purchases.filter((contract) => contract.status === PurchaseStatus.DRAFT);
        const exportPendingItems = sales.filter((contract) => hasExportExecutionMetrics(contract));

        setMetrics({
          draftPurchases: draftPurchaseItems.length,
          exportPendingParams: exportPendingItems.length,
          receivable: analytics?.contracts.sales.receivable || 0,
          unpaidAmount: analytics?.contracts.purchase.unpaidAmount || 0,
          inventoryRecords: analytics?.inventory.recordCount || 0,
          latestFinancePeriod: periods[0]?.periodLabel || null,
        });
        setDraftTasks(draftPurchaseItems.slice(0, 4).map((contract) => ({ id: contract.id, contractNo: contract.contractNo })));
        setExportTasks(exportPendingItems.slice(0, 4).map((contract) => ({ id: contract.id, contractNo: contract.contractNo })));
      } catch {
        if (!active) return;
        setMetrics({
          draftPurchases: 0,
          exportPendingParams: 0,
          receivable: 0,
          unpaidAmount: 0,
          inventoryRecords: 0,
          latestFinancePeriod: null,
        });
        setDraftTasks([]);
        setExportTasks([]);
      }
    };

    void loadMetrics();
    return () => {
      active = false;
    };
  }, []);

  const topTasks = useMemo(() => [
    ...draftTasks.map((task) => ({
      id: task.id,
      title: task.contractNo || task.id,
      label: '采购合同待起草',
      href: `/dashboard/purchase/${task.id}`,
    })),
    ...exportTasks.map((task) => ({
      id: task.id,
      title: task.contractNo || task.id,
      label: '出口参数待补录',
      href: `/dashboard/sales/${task.id}`,
    })),
  ].slice(0, 6), [draftTasks, exportTasks]);

  const indicators = [
    { label: '待起草采购', value: metrics.draftPurchases, icon: ShoppingCart },
    { label: '出口待补录', value: metrics.exportPendingParams, icon: Ship },
    { label: '库存记录', value: metrics.inventoryRecords, icon: PackageCheck },
    { label: '最新账期', value: metrics.latestFinancePeriod || '未上传', icon: Receipt },
  ];

  if (!user) return null;

  return (
    <div className="space-y-8 pb-16">
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />
      <PageHeader
        title="工作台"
        description="集中查看采购、出口、库存与资金的关键待办。"
        showBack={false}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="经营指标">
        {indicators.map((item) => (
          <Card key={item.label} className="border-border/70">
            <CardContent className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{item.value}</p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">近期待办</h2>
            <Button variant="ghost" className="rounded-md" onClick={() => router.push('/dashboard/reports')}>
              经营执行
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2">
            {topTasks.length > 0 ? topTasks.map((task) => (
              <button
                key={`${task.label}-${task.id}`}
                type="button"
                onClick={() => router.push(task.href)}
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{task.title}</span>
                  <span className="block text-xs text-muted-foreground">{task.label}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )) : (
              <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                暂无待办
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">快速动作</h2>
          <div className="grid gap-2">
            <Button className="justify-start rounded-md" onClick={() => router.push('/dashboard/purchase/create')}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              新建采购合同
            </Button>
            <Button className="justify-start rounded-md" variant="outline" onClick={() => router.push('/dashboard/sales/create')}>
              <Ship className="mr-2 h-4 w-4" />
              新建出口合同
            </Button>
            <Button className="justify-start rounded-md" variant="outline" onClick={() => router.push('/dashboard/tax-refunds?view=customs')}>
              <FileText className="mr-2 h-4 w-4" />
              查看报关单
            </Button>
          </div>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">资金摘要</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Banknote className="h-4 w-4" />
                  出口待收
                </span>
                <span className="font-medium tabular-nums">{formatCurrency(metrics.receivable, 'USD')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                  采购待付
                </span>
                <span className="font-medium tabular-nums">{formatCurrency(metrics.unpaidAmount, 'CNY')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
