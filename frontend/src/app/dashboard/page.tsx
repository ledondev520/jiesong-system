/**
 * Input: 后端 dashboard API、opsExecutionService（未发货/采购清单）、aiService（analytics）
 * Output: 工作台页面（待办驱动 + 快捷入口 + 流程执行）
 * Pos: 系统首页，突出"今天该做什么"与快速行动
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  FileCheck2,
  PackageSearch,
  ShipWheel,
  ShoppingCart,
  ChevronRight,
  FileText,
  Ship,
  Plus,
  TrendingUp,
  AlertCircle,
  Warehouse,
  Banknote,
  Receipt,
  ArrowRightLeft,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataDashboard } from '@/components/dashboard/DataDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PurchaseStatus, SalesContract, SalesStatus, Role } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { salesService } from '@/services/sales.service';
import { financialStatementsService } from '@/services/financialStatements.service';
import { aiService } from '@/services/ai.service';
import { useAuthStore } from '@/store/auth.store';
import { UnshippedListTab } from './ops-execution/components/UnshippedListTab';
import { PurchaseChecklistTab } from './ops-execution/components/PurchaseChecklistTab';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const procurementSteps = [
  '起草采购并生成合同',
  '发给供应商签署',
  '回签归档后推进出口',
];

const exportSteps = [
  '补录箱数/毛重/体积',
  '安排装柜与报关',
  '确认收款与核销',
];

const purchaseFlowSteps = ['起草采购合同', '供应商签署', '安排生产', '确认收货'];
const salesFlowSteps = ['创建出口合同', '装箱补录', '报关放行', '确认收款'];

type TaskItem = {
  id: string;
  contractNo?: string;
};

type DashboardMetrics = {
  draftPurchases: number;
  exportPendingParams: number;
  receivable: number;
  unpaidAmount: number;
  latestFinancePeriod: string | null;
};

const hasExportExecutionMetrics = (contract: Pick<SalesContract, 'status' | 'totalBoxes' | 'grossWeight' | 'volume'>) => {
  if (![SalesStatus.DRAFT, SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)) {
    return false;
  }

  return !(contract.totalBoxes > 0 && contract.grossWeight > 0 && contract.volume > 0);
};

const formatCurrency = (amount: number, currency: 'CNY' | 'USD') => {
  if (amount === 0) return currency === 'CNY' ? '¥0' : '$0';
  return `${currency === 'CNY' ? '¥' : '$'}${amount.toLocaleString()}`;
};

type ViewProps = {
  metrics: DashboardMetrics;
  draftTasks: TaskItem[];
  exportTasks: TaskItem[];
  router: ReturnType<typeof useRouter>;
};

/* ========== 采购员 / 仓库管理员视图 ========== */
function PurchaseDashboard({ metrics, draftTasks, router }: ViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="采购工作台" showBack={false} />

      {/* 今日待办 — 3 个采购指标 */}
      <section aria-label="今日待办" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card
          className="metric-card cursor-pointer border-border/40 bg-card/60 transition-all hover:border-primary/25 hover:bg-card hover:shadow-sm"
          onClick={() => router.push('/dashboard/contracts')}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/12">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">待起草采购</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {metrics.draftPurchases}
                {metrics.draftPurchases > 0 && (
                  <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-primary" />
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/8 text-amber-600 ring-1 ring-amber-500/12">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">紧急采购</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">—</p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/8 text-blue-600 ring-1 ring-blue-500/12">
              <Warehouse className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">待收货</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">—</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 快捷操作 */}
      <section aria-label="快捷操作" className="flex flex-wrap gap-2">
        <Button
          className="h-10 rounded-lg text-sm font-medium"
          onClick={() => router.push('/dashboard/purchase/create')}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          新建采购合同
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/contracts')}
        >
          <Warehouse className="mr-2 h-4 w-4" />
          确认入库
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/contracts')}
        >
          <ClipboardList className="mr-2 h-4 w-4" />
          跟进采购合同
        </Button>
      </section>

      {/* 采购流程 */}
      <section aria-label="流程待办">
        <Card className="border-primary/12">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-primary/8 text-primary">
                采购流程
              </Badge>
              {metrics.draftPurchases > 0 && (
                <Badge variant="outline" className="rounded-full">
                  待办 {metrics.draftPurchases}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold">起草 → 签署 → 生产 → 收货</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {purchaseFlowSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex-1 rounded-lg border border-border/40 bg-muted/20 p-3"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{step}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/purchase/create')}
              >
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                新建采购合同
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/contracts')}
              >
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                跟进合同
              </Button>
            </div>
            {draftTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">待起草</p>
                <div className="grid gap-1.5">
                  {draftTasks.map((task) => (
                    <Button
                      key={task.id}
                      variant="ghost"
                      size="sm"
                      className="h-9 justify-between rounded-lg border border-border/30 px-3 text-left text-sm"
                      onClick={() => router.push(`/dashboard/purchase/${task.id}`)}
                      aria-label={`编辑采购合同 ${task.contractNo || task.id}`}
                    >
                      <span className="font-medium">{task.contractNo || task.id}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        编辑 <ChevronRight className="h-3 w-3" />
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ========== 销售员视图 ========== */
function SalesDashboard({ metrics, exportTasks, router }: ViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="销售工作台" showBack={false} />

      {/* 今日待办 — 3 个销售指标 */}
      <section aria-label="今日待办" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card
          className="metric-card cursor-pointer border-border/40 bg-card/60 transition-all hover:border-blue-500/25 hover:bg-card hover:shadow-sm"
          onClick={() => router.push('/dashboard/sales')}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/8 text-blue-600 ring-1 ring-blue-500/12">
              <Ship className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">待补录出口</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {metrics.exportPendingParams}
                {metrics.exportPendingParams > 0 && (
                  <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-blue-500" />
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/12">
              <ShipWheel className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">在途货柜</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">—</p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/8 text-amber-600 ring-1 ring-amber-500/12">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">待收款</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(metrics.receivable, 'USD')}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 快捷操作 */}
      <section aria-label="快捷操作" className="flex flex-wrap gap-2">
        <Button
          className="h-10 rounded-lg text-sm font-medium"
          onClick={() => router.push('/dashboard/sales/create')}
        >
          <Ship className="mr-2 h-4 w-4" />
          新建出口合同
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/sales')}
        >
          <ShipWheel className="mr-2 h-4 w-4" />
          补录出口参数
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/sales')}
        >
          <ClipboardList className="mr-2 h-4 w-4" />
          查看在途货柜
        </Button>
      </section>

      {/* 出口流程 */}
      <section aria-label="流程待办">
        <Card className="border-blue-500/12">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-blue-500/8 text-blue-600">
                出口流程
              </Badge>
              {metrics.exportPendingParams > 0 && (
                <Badge variant="outline" className="rounded-full">
                  待补录 {metrics.exportPendingParams}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold">创建 → 装箱 → 报关 → 收款</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {salesFlowSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex-1 rounded-lg border border-border/40 bg-muted/20 p-3"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-bold text-blue-600">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{step}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/sales')}
              >
                <ShipWheel className="mr-1.5 h-3.5 w-3.5" />
                去补录出口参数
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/sales/create')}
              >
                <Ship className="mr-1.5 h-3.5 w-3.5" />
                新建出口合同
              </Button>
            </div>
            {exportTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">待补录</p>
                <div className="grid gap-1.5">
                  {exportTasks.map((task) => (
                    <Button
                      key={task.id}
                      variant="ghost"
                      size="sm"
                      className="h-9 justify-between rounded-lg border border-border/30 px-3 text-left text-sm"
                      onClick={() => router.push(`/dashboard/sales/${task.id}`)}
                      aria-label={`补录出口参数 ${task.contractNo || task.id}`}
                    >
                      <span className="font-medium">{task.contractNo || task.id}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        补录 <ChevronRight className="h-3 w-3" />
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ========== 财务视图 ========== */
function FinanceDashboard({ metrics, router }: ViewProps) {
  return (
    <div className="space-y-6">
      <PageHeader title="财务工作台" showBack={false} />

      {/* 今日待办 — 4 个财务指标 */}
      <section aria-label="今日待办" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/8 text-amber-600 ring-1 ring-amber-500/12">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">应收总额</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(metrics.receivable, 'USD')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/8 text-destructive ring-1 ring-destructive/12">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">应付总额</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(metrics.unpaidAmount, 'CNY')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/12">
              <Banknote className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">本月收付款</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {metrics.latestFinancePeriod || '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card border-border/40 bg-card/60">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/8 text-blue-600 ring-1 ring-blue-500/12">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">逾期账款</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">—</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 快捷操作 */}
      <section aria-label="快捷操作" className="flex flex-wrap gap-2">
        <Button
          className="h-10 rounded-lg text-sm font-medium"
          onClick={() => router.push('/dashboard/finance')}
        >
          <Receipt className="mr-2 h-4 w-4" />
          新增收款
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/finance')}
        >
          <Banknote className="mr-2 h-4 w-4" />
          新增付款
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/finance')}
        >
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          查看对账
        </Button>
      </section>

      <DataDashboard />
    </div>
  );
}

/* ========== 管理员 / 老板视图（保持现有统一视图） ========== */
function AdminDashboard({ metrics, draftTasks, exportTasks, router }: ViewProps) {
  return (
    <div className="space-y-6">
      {/* 标题：去掉 description */}
      <PageHeader title="工作台" showBack={false} />

      {/* 今日待办 — 4 个真实指标 */}
      <section aria-label="今日待办" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card
          className="metric-card cursor-pointer border-border/40 bg-card/60 transition-all hover:border-primary/25 hover:bg-card hover:shadow-sm"
          onClick={() => router.push('/dashboard/contracts')}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/12">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">待起草采购</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {metrics.draftPurchases}
                {metrics.draftPurchases > 0 && (
                  <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-primary" />
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="metric-card cursor-pointer border-border/40 bg-card/60 transition-all hover:border-blue-500/25 hover:bg-card hover:shadow-sm"
          onClick={() => router.push('/dashboard/sales')}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/8 text-blue-600 ring-1 ring-blue-500/12">
              <Ship className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">待补录出口</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {metrics.exportPendingParams}
                {metrics.exportPendingParams > 0 && (
                  <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-blue-500" />
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="metric-card cursor-pointer border-border/40 bg-card/60 transition-all hover:border-amber-500/25 hover:bg-card hover:shadow-sm"
          onClick={() => router.push('/dashboard/finance')}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/8 text-amber-600 ring-1 ring-amber-500/12">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">销售待收款</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(metrics.receivable, 'USD')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="metric-card cursor-pointer border-border/40 bg-card/60 transition-all hover:border-destructive/25 hover:bg-card hover:shadow-sm"
          onClick={() => router.push('/dashboard/finance')}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/8 text-destructive ring-1 ring-destructive/12">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground/80">采购待付款</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(metrics.unpaidAmount, 'CNY')}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 快捷操作 */}
      <section aria-label="快捷操作" className="flex flex-wrap gap-2">
        <Button
          className="h-10 rounded-lg text-sm font-medium"
          onClick={() => router.push('/dashboard/purchase/create')}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          新建采购合同
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/suppliers')}
        >
          <FileCheck2 className="mr-2 h-4 w-4" />
          新增供应商
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border/35 text-sm font-medium"
          onClick={() => router.push('/dashboard/contracts')}
        >
          <ClipboardList className="mr-2 h-4 w-4" />
          跟进采购合同
        </Button>
      </section>

      {/* 流程待办 — 采购 + 出口双卡片 */}
      <section aria-label="流程待办" className="grid gap-4 lg:grid-cols-2">
        {/* 采购流程 */}
        <Card className="border-primary/12">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-primary/8 text-primary">
                采购流程
              </Badge>
              {metrics.draftPurchases > 0 && (
                <Badge variant="outline" className="rounded-full">
                  待办 {metrics.draftPurchases}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold">起草 → 签署 → 归档</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {procurementSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex-1 rounded-lg border border-border/40 bg-muted/20 p-3"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{step}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/purchase/create')}
              >
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                新建采购合同
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/contracts')}
              >
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                跟进合同
              </Button>
            </div>
            {draftTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">待起草</p>
                <div className="grid gap-1.5">
                  {draftTasks.map((task) => (
                    <Button
                      key={task.id}
                      variant="ghost"
                      size="sm"
                      className="h-9 justify-between rounded-lg border border-border/30 px-3 text-left text-sm"
                      onClick={() => router.push(`/dashboard/purchase/${task.id}`)}
                      aria-label={`编辑采购合同 ${task.contractNo || task.id}`}
                    >
                      <span className="font-medium">{task.contractNo || task.id}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        编辑 <ChevronRight className="h-3 w-3" />
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 出口流程 */}
        <Card className="border-blue-500/12">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-blue-500/8 text-blue-600">
                出口流程
              </Badge>
              {metrics.exportPendingParams > 0 && (
                <Badge variant="outline" className="rounded-full">
                  待补录 {metrics.exportPendingParams}
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold">补录 → 装柜 → 收款</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {exportSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex-1 rounded-lg border border-border/40 bg-muted/20 p-3"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-bold text-blue-600">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{step}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/sales')}
              >
                <ShipWheel className="mr-1.5 h-3.5 w-3.5" />
                去补录出口参数
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => router.push('/dashboard/sales/create')}
              >
                <Ship className="mr-1.5 h-3.5 w-3.5" />
                新建出口合同
              </Button>
            </div>
            {exportTasks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">待补录</p>
                <div className="grid gap-1.5">
                  {exportTasks.map((task) => (
                    <Button
                      key={task.id}
                      variant="ghost"
                      size="sm"
                      className="h-9 justify-between rounded-lg border border-border/30 px-3 text-left text-sm"
                      onClick={() => router.push(`/dashboard/sales/${task.id}`)}
                      aria-label={`补录出口参数 ${task.contractNo || task.id}`}
                    >
                      <span className="font-medium">{task.contractNo || task.id}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        补录 <ChevronRight className="h-3 w-3" />
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <DataDashboard />

      {/* 经营执行 */}
      <section aria-label="经营执行" className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">经营执行</h2>
        <Tabs defaultValue="unshipped" className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-border/40 bg-muted/30 p-1">
            <TabsTrigger
              value="unshipped"
              className="gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
            >
              <PackageSearch className="h-4 w-4" />
              未发货清单
            </TabsTrigger>
            <TabsTrigger
              value="purchase-checklist"
              className="gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
            >
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

      {/* 快捷创建 FAB */}
      <div className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-105 active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 w-56 rounded-xl">
            <DropdownMenuItem
              className="gap-3 rounded-lg py-2.5 cursor-pointer"
              onClick={() => router.push('/dashboard/purchase/create')}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">新建采购合同</p>
                <p className="text-xs text-muted-foreground">选择供应商与商品</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-3 rounded-lg py-2.5 cursor-pointer"
              onClick={() => router.push('/dashboard/sales/create')}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Ship className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">新建出口合同</p>
                <p className="text-xs text-muted-foreground">关联门店与定价</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-3 rounded-lg py-2.5 cursor-pointer"
              onClick={() => router.push('/dashboard/suppliers')}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileCheck2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">新增供应商</p>
                <p className="text-xs text-muted-foreground">录入供应商档案</p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * 职责：渲染工作台首页（待办驱动）
 * 思路：
 *  0. 去掉装饰性标题与描述
 *  1. 顶部真实待办指标（可点击跳转）
 *  2. 快捷操作入口
 *  3. 流程卡片（采购 + 出口），带步骤与待办
 *  4. 数据看板（精简装饰）
 *  5. 经营执行（未发货 + 采购清单）
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    draftPurchases: 0,
    exportPendingParams: 0,
    receivable: 0,
    unpaidAmount: 0,
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

        if (!active) {
          return;
        }

        const purchases = purchaseRes.data?.items || [];
        const sales = salesRes.data?.items || [];
        const analytics = analyticsRes?.data;

        setMetrics({
          draftPurchases: purchases.filter((c) => c.status === PurchaseStatus.DRAFT).length,
          exportPendingParams: sales.filter((c) => hasExportExecutionMetrics(c)).length,
          receivable: analytics?.contracts.sales.receivable || 0,
          unpaidAmount: analytics?.contracts.purchase.unpaidAmount || 0,
          latestFinancePeriod: periods[0]?.periodLabel || null,
        });

        setDraftTasks(
          purchases
            .filter((c) => c.status === PurchaseStatus.DRAFT)
            .slice(0, 3)
            .map((c) => ({ id: c.id, contractNo: c.contractNo })),
        );

        setExportTasks(
          sales
            .filter((c) => hasExportExecutionMetrics(c))
            .slice(0, 3)
            .map((c) => ({ id: c.id, contractNo: c.contractNo })),
        );
      } catch {
        if (!active) {
          return;
        }

        setMetrics({
          draftPurchases: 0,
          exportPendingParams: 0,
          receivable: 0,
          unpaidAmount: 0,
          latestFinancePeriod: null,
        });
        setDraftTasks([]);
        setExportTasks([]);
      }
    };

    loadMetrics();

    return () => {
      active = false;
    };
  }, []);

  if (!user) {
    return null;
  }

  const viewProps: ViewProps = {
    metrics,
    draftTasks,
    exportTasks,
    router,
  };

  switch (user.role) {
    case Role.PURCHASE:
    case Role.WAREHOUSE:
      return <PurchaseDashboard {...viewProps} />;
    case Role.SALES:
      return <SalesDashboard {...viewProps} />;
    case Role.FINANCE:
      return <FinanceDashboard {...viewProps} />;
    case Role.ADMIN:
    default:
      return <AdminDashboard {...viewProps} />;
  }
}
