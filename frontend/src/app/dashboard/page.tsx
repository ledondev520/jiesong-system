/**
 * Input: 后端 dashboard API、opsExecutionService、aiService
 * Output: 重构后的工作台首页（Bento Grid + 数据可视化 + 动画）
 * Pos: 系统首页，体现 Kimi K2.6 前端审美
 */

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  FileText, Ship, TrendingUp, AlertCircle, ShoppingCart,
  Warehouse, ClipboardList, ShipWheel, Plus, FileCheck2,
  Receipt, Banknote, ArrowRightLeft, PackageSearch,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataDashboard } from '@/components/dashboard/DataDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { QuickActionGrid } from '@/components/dashboard/QuickActionGrid';
import { PriorityTaskList } from '@/components/dashboard/PriorityTaskList';
import { PurchaseStatus, SalesContract, SalesStatus, Role } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { salesService } from '@/services/sales.service';
import { financialStatementsService } from '@/services/financialStatements.service';
import { aiService } from '@/services/ai.service';
import { useAuthStore } from '@/store/auth.store';
import { UnshippedListTab } from './ops-execution/components/UnshippedListTab';
import { PurchaseChecklistTab } from './ops-execution/components/PurchaseChecklistTab';
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts';

/* ─── types ─── */
type TaskItem = { id: string; contractNo?: string };

type DashboardMetrics = {
  draftPurchases: number;
  exportPendingParams: number;
  receivable: number;
  unpaidAmount: number;
  latestFinancePeriod: string | null;
};

/* ─── helpers ─── */
const hasExportExecutionMetrics = (c: Pick<SalesContract, 'status' | 'totalBoxes' | 'grossWeight' | 'volume'>) => {
  if (![SalesStatus.DRAFT, SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(c.status)) return false;
  return !(c.totalBoxes > 0 && c.grossWeight > 0 && c.volume > 0);
};

const formatCurrency = (amount: number, currency: 'CNY' | 'USD') => {
  if (amount === 0) return currency === 'CNY' ? '¥0' : '$0';
  return `${currency === 'CNY' ? '¥' : '$'}${amount.toLocaleString()}`;
};

/* 模拟 7 天趋势数据（实际应来自 API） */
const mockTrend = (base: number) =>
  Array.from({ length: 7 }, (_, i) => ({ value: Math.round(base * (0.6 + Math.random() * 0.8)) }));

/* 模拟月度趋势 */
const mockMonthlyTrend = () => [
  { month: '1月', sales: 120000, purchase: 98000 },
  { month: '2月', sales: 145000, purchase: 110000 },
  { month: '3月', sales: 138000, purchase: 125000 },
  { month: '4月', sales: 162000, purchase: 130000 },
  { month: '5月', sales: 155000, purchase: 118000 },
  { month: '6月', sales: 178000, purchase: 142000 },
];

/* ─── shared view props ─── */
interface ViewProps {
  metrics: DashboardMetrics;
  draftTasks: TaskItem[];
  exportTasks: TaskItem[];
  router: ReturnType<typeof useRouter>;
}

/* ════════════════════════════════════════
   通用布局：欢迎语 + KPI Bento + 快捷入口 + 趋势/待办 + 经营执行
   ════════════════════════════════════════ */
function DashboardShell({
  metrics,
  draftTasks,
  exportTasks,
  router,
  role,
}: ViewProps & { role: string }) {
  const monthlyData = useMemo(() => mockMonthlyTrend(), []);

  const kpiItems = useMemo(() => {
    const base = [
      {
        label: '待起草采购',
        value: metrics.draftPurchases,
        icon: FileText,
        color: 'blue' as const,
        size: metrics.draftPurchases > 0 ? 'lg' : 'md',
        pulse: metrics.draftPurchases > 0,
        onClick: () => router.push('/dashboard/contracts'),
      },
      {
        label: '待补录出口',
        value: metrics.exportPendingParams,
        icon: Ship,
        color: 'violet' as const,
        size: metrics.exportPendingParams > 0 ? 'lg' : 'md',
        pulse: metrics.exportPendingParams > 0,
        onClick: () => router.push('/dashboard/sales'),
      },
      {
        label: '销售待收款',
        value: formatCurrency(metrics.receivable, 'USD'),
        icon: TrendingUp,
        color: 'amber' as const,
        size: 'md',
        onClick: () => router.push('/dashboard/finance'),
      },
      {
        label: '采购待付款',
        value: formatCurrency(metrics.unpaidAmount, 'CNY'),
        icon: AlertCircle,
        color: 'rose' as const,
        size: 'md',
        onClick: () => router.push('/dashboard/finance'),
      },
    ];
    return base;
  }, [metrics, router]);

  const quickActions = useMemo(() => [
    {
      label: '新建采购合同',
      description: '选择供应商与商品',
      icon: ShoppingCart,
      color: 'blue' as const,
      onClick: () => router.push('/dashboard/purchase/create'),
    },
    {
      label: '新建出口合同',
      description: '关联门店与定价',
      icon: Ship,
      color: 'violet' as const,
      onClick: () => router.push('/dashboard/sales/create'),
    },
    {
      label: '新增供应商',
      description: '录入供应商档案',
      icon: FileCheck2,
      color: 'green' as const,
      onClick: () => router.push('/dashboard/suppliers'),
    },
    {
      label: '查看经营报表',
      description: '老板视角数据汇总',
      icon: TrendingUp,
      color: 'amber' as const,
      onClick: () => router.push('/dashboard/reports'),
    },
  ], [router]);

  const priorityTasks = useMemo(() => {
    const tasks = [
      ...draftTasks.map((t) => ({
        id: t.id,
        title: t.contractNo || t.id,
        subtitle: '采购合同待起草',
        priority: 'high' as const,
        onClick: () => router.push(`/dashboard/purchase/${t.id}`),
      })),
      ...exportTasks.map((t) => ({
        id: t.id,
        title: t.contractNo || t.id,
        subtitle: '出口参数待补录',
        priority: 'urgent' as const,
        onClick: () => router.push(`/dashboard/sales/${t.id}`),
      })),
    ];
    return tasks.slice(0, 6);
  }, [draftTasks, exportTasks, router]);

  return (
    <div className="space-y-6 pb-20">
      {/* 欢迎语 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <PageHeader title={`${role}工作台`} showBack={false} />
        <p className="mt-1 text-sm text-muted-foreground/60">
          {new Date().toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </p>
      </motion.div>

      {/* KPI Bento Grid */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiItems.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
            className={kpi.size === 'lg' ? 'col-span-2 lg:col-span-2' : ''}
          >
            <KpiCard
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              color={kpi.color}
              size={kpi.size as 'sm' | 'md' | 'lg'}
              onClick={kpi.onClick}
              pulse={kpi.pulse}
              trend={mockTrend(typeof kpi.value === 'number' ? kpi.value : 50)}
            />
          </motion.div>
        ))}
      </section>

      {/* 快捷入口 */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <QuickActionGrid actions={quickActions} />
      </motion.section>

      {/* 趋势图 + 待办列表 双栏 */}
      <section className="grid gap-4 lg:grid-cols-5">
        {/* 左侧：月度趋势大图 */}
        <motion.div
          className="rounded-2xl border border-border/30 bg-card/60 p-5 backdrop-blur-sm lg:col-span-3"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">经营趋势</h3>
            <span className="text-xs text-muted-foreground/50">近 6 个月</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: 12,
                  }}
                  formatter={(value: unknown) => [`¥${Number(value).toLocaleString()}`, '']}
                />
                <Area type="monotone" dataKey="sales" stroke="#8b5cf6" strokeWidth={2} fill="url(#salesGrad)" name="销售额" animationDuration={1500} />
                <Area type="monotone" dataKey="purchase" stroke="#3b82f6" strokeWidth={2} fill="url(#purchaseGrad)" name="采购额" animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* 右侧：待办列表 */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <PriorityTaskList
            tasks={priorityTasks}
            title="优先处理"
            emptyText="暂无待办，工作高效！"
          />
        </motion.div>
      </section>

      {/* DataDashboard（保留） */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }}>
        <DataDashboard />
      </motion.div>

      {/* 经营执行 Tabs（保留） */}
      <motion.section
        aria-label="经营执行"
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.4 }}
      >
        <h2 className="text-lg font-semibold tracking-tight">经营执行</h2>
        <Tabs defaultValue="unshipped" className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-border/40 bg-muted/30 p-1">
            <TabsTrigger value="unshipped" className="gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <PackageSearch className="h-4 w-4" />
              未发货清单
            </TabsTrigger>
            <TabsTrigger value="purchase-checklist" className="gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <ClipboardList className="h-4 w-4" />
              门店采购清单
            </TabsTrigger>
          </TabsList>
          <TabsContent value="unshipped"><UnshippedListTab /></TabsContent>
          <TabsContent value="purchase-checklist"><PurchaseChecklistTab /></TabsContent>
        </Tabs>
      </motion.section>

      {/* FAB（保留） */}
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
            <DropdownMenuItem className="gap-3 rounded-lg py-2.5 cursor-pointer" onClick={() => router.push('/dashboard/purchase/create')}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">新建采购合同</p>
                <p className="text-xs text-muted-foreground">选择供应商与商品</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 rounded-lg py-2.5 cursor-pointer" onClick={() => router.push('/dashboard/sales/create')}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Ship className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium">新建出口合同</p>
                <p className="text-xs text-muted-foreground">关联门店与定价</p>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 rounded-lg py-2.5 cursor-pointer" onClick={() => router.push('/dashboard/suppliers')}>
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

/* ════════════════════════════════════════
   各角色视图（全部统一使用 DashboardShell）
   ════════════════════════════════════════ */

function PurchaseDashboardView(props: ViewProps) {
  return <DashboardShell {...props} role="采购" />;
}

function SalesDashboardView(props: ViewProps) {
  return <DashboardShell {...props} role="销售" />;
}

function FinanceDashboardView(props: ViewProps) {
  return <DashboardShell {...props} role="财务" />;
}

function AdminDashboardView(props: ViewProps) {
  return <DashboardShell {...props} role="管理" />;
}

/* ════════════════════════════════════════
   主页面
   ════════════════════════════════════════ */
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
        if (!active) return;
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
          purchases.filter((c) => c.status === PurchaseStatus.DRAFT).slice(0, 3).map((c) => ({ id: c.id, contractNo: c.contractNo })),
        );
        setExportTasks(
          sales.filter((c) => hasExportExecutionMetrics(c)).slice(0, 3).map((c) => ({ id: c.id, contractNo: c.contractNo })),
        );
      } catch {
        if (!active) return;
        setMetrics({ draftPurchases: 0, exportPendingParams: 0, receivable: 0, unpaidAmount: 0, latestFinancePeriod: null });
        setDraftTasks([]);
        setExportTasks([]);
      }
    };
    loadMetrics();
    return () => { active = false; };
  }, []);

  if (!user) return null;

  const viewProps: ViewProps = { metrics, draftTasks, exportTasks, router };

  switch (user.role) {
    case Role.PURCHASE:
    case Role.WAREHOUSE:
      return <PurchaseDashboardView {...viewProps} />;
    case Role.SALES:
      return <SalesDashboardView {...viewProps} />;
    case Role.FINANCE:
      return <FinanceDashboardView {...viewProps} />;
    case Role.ADMIN:
    default:
      return <AdminDashboardView {...viewProps} />;
  }
}
