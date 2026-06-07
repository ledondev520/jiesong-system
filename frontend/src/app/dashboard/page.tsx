/**
 * Input: 后端 dashboard API、采购/销售列表、当前用户
 * Output: 管理工作台首页（采购、销售、仓储物流、财务四个并行模块入口）
 * Pos: 系统首页，作为顶级模块导航与待办摘要的统一入口
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Banknote,
  Boxes,
  ClipboardList,
  FileText,
  Landmark,
  PackageOpen,
  Receipt,
  Search,
  Ship,
  ShoppingCart,
  Warehouse,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  productCount: number;
  latestFinancePeriod: string | null;
};

type WorkbenchModule = {
  key: string;
  title: string;
  icon: typeof ShoppingCart;
  href: string;
  badge: string;
  primaryLabel: string;
  primaryHref: string;
  metrics: Array<{ label: string; value: string | number }>;
  links: Array<{ label: string; href: string; icon: typeof ShoppingCart }>;
};

const hasExportExecutionMetrics = (contract: Pick<SalesContract, 'status' | 'totalBoxes' | 'grossWeight' | 'volume'>) => {
  if (![SalesStatus.DRAFT, SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)) return false;
  return !(contract.totalBoxes > 0 && contract.grossWeight > 0 && contract.volume > 0);
};

const formatCurrency = (amount: number, currency: 'CNY' | 'USD') => {
  if (!amount) return currency === 'CNY' ? '¥0' : '$0';
  return `${currency === 'CNY' ? '¥' : '$'}${Math.round(amount).toLocaleString()}`;
};

const formatCount = (value: number) => value.toLocaleString();

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    draftPurchases: 0,
    exportPendingParams: 0,
    receivable: 0,
    unpaidAmount: 0,
    inventoryRecords: 0,
    productCount: 0,
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
          productCount: analytics?.inventory.productCount || 0,
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
          productCount: 0,
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

  const modules = useMemo<WorkbenchModule[]>(() => [
    {
      key: 'procurement',
      title: '采购',
      icon: ShoppingCart,
      href: '/dashboard/contracts',
      badge: `${formatCount(metrics.draftPurchases)} 待起草`,
      primaryLabel: '进入采购',
      primaryHref: '/dashboard/contracts',
      metrics: [
        { label: '待起草采购', value: metrics.draftPurchases },
        { label: '采购待付款', value: formatCurrency(metrics.unpaidAmount, 'CNY') },
      ],
      links: [
        { label: '采购合同', href: '/dashboard/contracts', icon: FileText },
        { label: '供应商', href: '/dashboard/suppliers', icon: ClipboardList },
      ],
    },
    {
      key: 'sales',
      title: '销售',
      icon: PackageOpen,
      href: '/dashboard/sales',
      badge: `${formatCount(metrics.exportPendingParams)} 待补录`,
      primaryLabel: '进入销售',
      primaryHref: '/dashboard/sales',
      metrics: [
        { label: '待补录出口', value: metrics.exportPendingParams },
        { label: '销售待收款', value: formatCurrency(metrics.receivable, 'USD') },
      ],
      links: [
        { label: '销售合同', href: '/dashboard/sales', icon: Ship },
        { label: '出口退税', href: '/dashboard/tax-refunds', icon: Receipt },
      ],
    },
    {
      key: 'logistics',
      title: '仓储物流',
      icon: Warehouse,
      href: '/dashboard/logistics',
      badge: `${formatCount(metrics.inventoryRecords)} 库存记录`,
      primaryLabel: '进入仓储物流',
      primaryHref: '/dashboard/logistics',
      metrics: [
        { label: '库存记录', value: metrics.inventoryRecords },
        { label: '商品档案', value: metrics.productCount },
      ],
      links: [
        { label: '货柜装箱', href: '/dashboard/logistics/containers', icon: Boxes },
        { label: '报关与 HS', href: '/dashboard/customs-declarations', icon: Search },
      ],
    },
    {
      key: 'finance',
      title: '财务',
      icon: Landmark,
      href: '/dashboard/finance',
      badge: metrics.latestFinancePeriod || '未上传账期',
      primaryLabel: '进入财务',
      primaryHref: '/dashboard/finance',
      metrics: [
        { label: '应收账款', value: formatCurrency(metrics.receivable, 'USD') },
        { label: '应付账款', value: formatCurrency(metrics.unpaidAmount, 'CNY') },
      ],
      links: [
        { label: '应收', href: '/dashboard/finance/receivable', icon: Banknote },
        { label: '应付', href: '/dashboard/finance/payable', icon: Receipt },
      ],
    },
  ], [metrics]);

  const topTasks = useMemo(() => [
    ...draftTasks.map((task) => ({
      id: task.id,
      title: task.contractNo || task.id,
      label: '采购待起草',
      href: `/dashboard/purchase/${task.id}`,
    })),
    ...exportTasks.map((task) => ({
      id: task.id,
      title: task.contractNo || task.id,
      label: '出口参数待补录',
      href: `/dashboard/sales/${task.id}`,
    })),
  ].slice(0, 6), [draftTasks, exportTasks]);

  if (!user) return null;

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="管理工作台"
        description="采购、销售、仓储物流、财务"
        showBack={false}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="模块入口">
        {modules.map((item) => (
          <Card key={item.key} className="overflow-hidden border-border/70">
            <CardHeader className="space-y-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="flex min-w-0 items-center gap-3 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="truncate text-xl">{item.title}</CardTitle>
                </button>
                <Badge variant="secondary" className="shrink-0 rounded-md">
                  {item.badge}
                </Badge>
              </div>
              <Button className="w-full justify-between rounded-md" onClick={() => router.push(item.primaryHref)}>
                {item.primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-2">
                {item.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-md bg-muted/50 p-3">
                    <dt className="truncate text-xs text-muted-foreground">{metric.label}</dt>
                    <dd className="mt-1 truncate text-lg font-semibold tabular-nums">{metric.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid grid-cols-2 gap-2">
                {item.links.map((link) => (
                  <Button
                    key={link.href}
                    variant="outline"
                    className="justify-start gap-2 rounded-md px-3"
                    onClick={() => router.push(link.href)}
                  >
                    <link.icon className="h-4 w-4" />
                    <span className="truncate">{link.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">近期待办</h2>
            <Button variant="ghost" className="rounded-md" onClick={() => router.push('/dashboard/reports')}>
              经营报表
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
          <h2 className="text-lg font-semibold tracking-tight">快速新建</h2>
          <div className="grid gap-2">
            <Button className="justify-start rounded-md" onClick={() => router.push('/dashboard/purchase/create')}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              新建采购合同
            </Button>
            <Button className="justify-start rounded-md" variant="outline" onClick={() => router.push('/dashboard/sales/create')}>
              <Ship className="mr-2 h-4 w-4" />
              新建销售合同
            </Button>
            <Button className="justify-start rounded-md" variant="outline" onClick={() => router.push('/dashboard/customs-declarations/create')}>
              <FileText className="mr-2 h-4 w-4" />
              新建报关单
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
