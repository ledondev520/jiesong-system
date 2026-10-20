/**
 * Input: 专项单主线路、URL范围、采购/出口摘要、财务账期、WPS同步状态与当前用户
 * Output: 保留历史范围、以“每笔专项单唯一下一动作”为核心的经营中台工作台
 * Pos: 经营中台首页；主线路是执行入口，指标和快速动作仅作辅助
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { Suspense, useEffect, useState } from "react";
import {
  replaceBrowserQuery,
  useBrowserQuery,
} from "@/lib/hooks/useBrowserQuery";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Banknote,
  FileText,
  PackageCheck,
  Receipt,
  Ship,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ModuleTabHeader,
  OPERATIONS_TABS,
} from "@/components/layout/ModuleTabHeader";
import { TradeWorkflowBoard } from "@/components/dashboard/TradeWorkflowBoard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { financialStatementsService } from "@/services/financialStatements.service";
import { aiService } from "@/services/ai.service";
import {
  tradeWorkflowService,
  type TradeWorkflow,
  type WpsSyncStatus,
} from "@/services/tradeWorkflow.service";
import { useAuthStore } from "@/store/auth.store";

type DashboardMetrics = {
  draftPurchases: number | null;
  exportPendingParams: number | null;
  receivable: number | null;
  unpaidAmount: number | null;
  inventoryRecords: number | null;
  latestFinancePeriod: string | null;
};

const EMPTY_METRICS: DashboardMetrics = {
  draftPurchases: null,
  exportPendingParams: null,
  receivable: null,
  unpaidAmount: null,
  inventoryRecords: null,
  latestFinancePeriod: null,
};

const formatCurrency = (amount: number | null, currency: "CNY" | "USD") => {
  if (amount === null) return "—";
  if (!amount) return currency === "CNY" ? "¥0" : "$0";
  return `${currency === "CNY" ? "¥" : "$"}${Math.round(amount).toLocaleString()}`;
};

function DashboardContent() {
  const searchParams = useSearchParams();
  const query = new URLSearchParams(useBrowserQuery(searchParams.toString()));
  const requestedView = query.get("workflowView");
  const workflowView =
    requestedView === "pending" ||
    requestedView === "blocked" ||
    requestedView === "risk"
      ? requestedView
      : "recent";
  const router = useRouter();
  const { user } = useAuthStore();
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [fundsUnavailable, setFundsUnavailable] = useState(false);
  const [periodUnavailable, setPeriodUnavailable] = useState(false);
  const [metricsRefresh, setMetricsRefresh] = useState(0);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [workflows, setWorkflows] = useState<TradeWorkflow[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowUnavailable, setWorkflowUnavailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState<WpsSyncStatus | null>(null);
  const [syncUnavailable, setSyncUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await tradeWorkflowService.syncStatus();
        if (active) {
          setSyncStatus(response.data || null);
          setSyncUnavailable(false);
        }
      } catch {
        if (active) setSyncUnavailable(true);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      setMetricsLoading(true);
      const [analytics, periods] = await Promise.allSettled([
        aiService.getDashboardAnalytics(),
        financialStatementsService.listStatements(),
      ]);
      if (!active) return;
      if (analytics.status === "fulfilled" && analytics.value.data) {
        const data = analytics.value.data;
        setMetrics((prev) => ({
          ...prev,
          draftPurchases: data.alerts?.draftPurchases ?? null,
          exportPendingParams: data.alerts?.exportPendingParams ?? null,
          receivable: data.contracts.sales.receivable,
          unpaidAmount: data.contracts.purchase.unpaidAmount,
          inventoryRecords: data.inventory.recordCount,
        }));
        setFundsUnavailable(false);
      } else setFundsUnavailable(true);
      if (periods.status === "fulfilled") {
        const latest = periods.value.reduce<
          (typeof periods.value)[number] | null
        >((current, period) => {
          if (!current) return period;
          if (period.year !== current.year)
            return period.year > current.year ? period : current;
          return period.month > current.month ? period : current;
        }, null);
        setMetrics((prev) => ({
          ...prev,
          latestFinancePeriod: latest?.periodLabel || null,
        }));
        setPeriodUnavailable(false);
      } else setPeriodUnavailable(true);
      setMetricsLoading(false);
    };
    void loadMetrics();
    return () => {
      active = false;
    };
  }, [metricsRefresh]);

  useEffect(() => {
    let active = true;
    const loadWorkflows = async () => {
      setWorkflowLoading(true);
      try {
        const response = await tradeWorkflowService.list(6, workflowView);
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

    void loadWorkflows();
    return () => {
      active = false;
    };
  }, [workflowView]);

  const indicators = [
    {
      label: "待起草采购",
      value: metrics.draftPurchases ?? "—",
      icon: ShoppingCart,
    },
    {
      label: "出口待补录",
      value: metrics.exportPendingParams ?? "—",
      icon: Ship,
    },
    {
      label: "库存记录",
      value: metrics.inventoryRecords ?? "—",
      icon: PackageCheck,
    },
    {
      label: "最新账期",
      value: periodUnavailable
        ? "账期读取失败"
        : metricsLoading && !metrics.latestFinancePeriod
          ? "加载中"
          : metrics.latestFinancePeriod || "未上传",
      icon: Receipt,
    },
  ];

  if (!user) return null;

  return (
    <div className="space-y-5 pb-4 md:space-y-8 md:pb-16">
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />
      <PageHeader
        title="工作台"
        description="按专项单执行采购、出口、退税与财务结清的唯一下一步。"
        showBack={false}
      />

      <div
        className="rounded-lg border bg-card p-4 text-sm"
        role="status"
        aria-live="polite"
      >
        <p className="font-medium">
          WPS 出货同步 ·{" "}
          {syncUnavailable
            ? "状态读取失败"
            : !syncStatus
              ? "正在查询"
              : {
                  never: "尚未完成同步",
                  current: "已核对",
                  needs_review: "已核对，仍有历史差异",
                  running: "同步中",
                  failed: "本轮失败",
                  stale: "超过90分钟未成功核对",
                }[syncStatus.state]}
        </p>
        {syncStatus?.message && (
          <p className="mt-1 text-muted-foreground">{syncStatus.message}</p>
        )}
        <p className="mt-1 text-muted-foreground">
          最近成功核对：
          {syncStatus?.lastSuccessAt
            ? new Date(syncStatus.lastSuccessAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })
            : "暂无"}
          {syncStatus && syncStatus.conflicts > 0
            ? `；${syncStatus.conflicts} 项待核对，未强行覆盖。`
            : ""}{" "}
          以 WPS 已上传内容为准；电脑及 Codex
          在线时每小时检查，失败在当前任务提醒。
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="专项单范围">
        {(
          [
            ["recent", "最近更新"],
            ["pending", "待处理"],
            ["blocked", "阻塞"],
            ["risk", "风险优先"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={workflowView === value ? "default" : "outline"}
            aria-pressed={workflowView === value}
            onClick={() =>
              replaceBrowserQuery({
                workflowView: value === "recent" ? undefined : value,
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>
      <TradeWorkflowBoard
        workflows={workflows}
        scope={workflowView}
        loading={workflowLoading}
        unavailable={workflowUnavailable}
      />

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="经营指标"
      >
        {indicators.map((item) => (
          <Card key={item.label} className="border-border/70 py-0 md:py-6">
            <CardContent className="flex items-center justify-between gap-2 p-3 md:p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
                  {item.value}
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      {periodUnavailable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMetricsRefresh((value) => value + 1)}
        >
          重试账期
        </Button>
      )}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">快速动作</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <BusinessWrite>
              <Button
                className="justify-start rounded-md"
                onClick={() => router.push("/dashboard/purchase/create")}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                新建采购合同
              </Button>
            </BusinessWrite>
            <BusinessWrite>
              <Button
                className="justify-start rounded-md"
                variant="outline"
                onClick={() => router.push("/dashboard/sales/create")}
              >
                <Ship className="mr-2 h-4 w-4" />
                新建出口合同
              </Button>
            </BusinessWrite>
            <Button
              className="justify-start rounded-md"
              variant="outline"
              onClick={() => router.push("/dashboard/tax-refunds?view=customs")}
            >
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
            {fundsUnavailable && (
              <div role="alert" className="text-destructive sm:col-span-2">
                资金读取失败
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => setMetricsRefresh((value) => value + 1)}
                >
                  重试资金
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2.5">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Banknote className="h-4 w-4" />
                出口待收（USD）
              </span>
              <span className="font-medium tabular-nums">
                {fundsUnavailable || metricsLoading
                  ? "—"
                  : formatCurrency(metrics.receivable, "USD")}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2.5">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Receipt className="h-4 w-4" />
                采购待付（CNY）
              </span>
              <span className="font-medium tabular-nums">
                {fundsUnavailable || metricsLoading
                  ? "—"
                  : formatCurrency(metrics.unpaidAmount, "CNY")}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
