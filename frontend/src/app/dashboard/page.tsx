/**
 * Input: 专项单主线路、采购/出口摘要、财务账期与当前用户
 * Output: 以“每笔专项单唯一下一动作”为核心的经营中台工作台
 * Pos: 经营中台首页；主线路是执行入口，指标和快速动作仅作辅助
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  FileText,
  PackageCheck,
  Receipt,
  Ship,
  ShoppingCart,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, OPERATIONS_TABS } from '@/components/layout/ModuleTabHeader';
import { TradeWorkflowBoard } from '@/components/dashboard/TradeWorkflowBoard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PurchaseStatus, SalesContract, SalesStatus } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { salesService } from '@/services/sales.service';
import { financialStatementsService } from '@/services/financialStatements.service';
import { aiService } from '@/services/ai.service';
import { tradeWorkflowService, type TradeWorkflow } from '@/services/tradeWorkflow.service';
import { useAuthStore } from '@/store/auth.store';

type DashboardMetrics = {
  draftPurchases: number;
  exportPendingParams: number;
  receivable: number;
  unpaidAmount: number;
  inventoryRecords: number;
  latestFinancePeriod: string | null;
};

const EMPTY_METRICS: DashboardMetrics = {
  draftPurchases: 0,
  exportPendingParams: 0,
  receivable: 0,
  unpaidAmount: 0,
  inventoryRecords: 0,
  latestFinancePeriod: null,
};

const hasExportExecutionMetrics = (
  contract: Pick<SalesContract, 'status' | 'totalBoxes' | 'grossWeight' | 'volume'>,
) => {
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
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [workflows, setWorkflows] = useState<TradeWorkflow[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowUnavailable, setWorkflowUnavailable] = useState(false);

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
        setMetrics({
          draftPurchases: purchases.filter((contract) => contract.status === PurchaseStatus.DRAFT).length,
          exportPendingParams: sales.filter((contract) => hasExportExecutionMetrics(contract)).length,
          receivable: analytics?.contracts.sales.receivable || 0,
          unpaidAmount: analytics?.contracts.purchase.unpaidAmount || 0,
          inventoryRecords: analytics?.inventory.recordCount || 0,
          latestFinancePeriod: periods[0]?.periodLabel || null,
        });
      } catch {
        if (active) setMetrics(EMPTY_METRICS);
      }
    };

    const loadWorkflows = async () => {
      try {
        const response = await tradeWorkflowService.list(6);
        if (!active) return;
        setWorkflows(response.data || []);
        setWorkflowUnavailable(false);
      } catch {
        if (!active) return;
        setWorkflows([]);
        setWorkflowUnavailable(true);
      } finally {
        if (active) setWorkflowLoading(false);
      }
    };

    void loadMetrics();
    void loadWorkflows();
    return () => {
      active = false;
    };
  }, []);

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
        description="按专项单执行采购、出口、退税与财务结清的唯一下一步。"
        showBack={false}
      />

      <TradeWorkflowBoard
        workflows={workflows}
        loading={workflowLoading}
        unavailable={workflowUnavailable}
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

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">快速动作</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
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
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">资金摘要</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Banknote className="h-4 w-4" />
                出口待收（USD）
              </span>
              <span className="font-medium tabular-nums">{formatCurrency(metrics.receivable, 'USD')}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Receipt className="h-4 w-4" />
                采购待付（CNY）
              </span>
              <span className="font-medium tabular-nums">{formatCurrency(metrics.unpaidAmount, 'CNY')}</span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
