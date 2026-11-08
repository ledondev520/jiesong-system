/**
 * Input: 后端财务 Interface、银行流水/发票统计 Interface、按需图表 Module
 * Output: 财务概览页面（收付进度 + 汇率 + 银行流水/发票摘要 + 紧迫信号 + 趋势折线图 + 快捷导航）
 * Pos: 财务模块首页，提供公司财务进度驾驶舱；手动刷新失效两层请求缓存
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { formatAmount } from "@/lib/format";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  BarChart3,
  RefreshCw,
  Landmark,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { financeService } from "@/services/finance.service";
import {
  getTransactionStats,
  getInvoiceStats,
  type BankFlowStats,
  type InvoiceStats,
} from "@/services/bankFlow.service";
import api, { clearApiGetCache } from "@/lib/axios";
import { type ApiResponse } from "@/types";
import { cachedFetch, invalidateCache } from "@/lib/api-cache";
import { FINANCE_LEDGER_ROLES } from "@/components/layout/navigation.config";
import { useAuthStore } from "@/store/auth.store";
import { comparePeriods, NO_PRIOR_PERIOD } from "@/lib/period-comparison";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { KpiStat } from "@/components/ui/kpi-stat";
import {
  buildCnyCashFlowForecast,
  convertPaymentTrendsToCny,
} from "@/lib/finance-currency";

const FinanceOverviewCharts = lazy(
  () => import("./components/FinanceOverviewCharts"),
);

const MonthlyStatementsTrend = lazy(
  () => import("./components/MonthlyStatementsTrend"),
);

const financeChartsFallback = (
  <Card aria-busy="true">
    <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      正在加载财务趋势图...
    </CardContent>
  </Card>
);

interface PaymentTrendPoint {
  label: string;
  receivables: number;
  payables: number;
}

interface OverdueItem {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  unreceived: number;
  shippedAt: string;
  overdueDays: number;
  status: string;
}

interface FinanceStats {
  payable: { total: number; paid: number; unpaid: number };
  receivable: { total: number; received: number; unreceived: number };
}

interface ExchangeRate {
  rate: number;
  buffer: number;
  effectiveRate: number;
}

/**
 * 职责：渲染财务概览驾驶舱
 * 思路：
 *   1. 顶部 KPI 卡片：总额、已付/已收、待付/待收（带完成率进度条）
 *   2. 中部驾驶舱卡片：汇率显示、紧迫性预警、账款健康度
 *   3. 报表分析入口：三表分析放在专门页面，避免概览首屏重复加载重模块
 */
export default function FinancePage() {
  // 与 bankFlow/statements/business-overview 的后端角色一致；仅隐藏会得到 403 的入口与请求
  const role = useAuthStore((state) => state.user?.role);
  const canReadLedger = !!role && FINANCE_LEDGER_ROLES.includes(role);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [trends, setTrends] = useState<PaymentTrendPoint[]>([]);
  const [trendDays, setTrendDays] = useState<30 | 90>(90);
  const [overdueList, setOverdueList] = useState<OverdueItem[]>([]);
  const [bankStats, setBankStats] = useState<BankFlowStats | null>(null);
  const [invStats, setInvStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const hasLoadedRef = useRef(false);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        invalidateCache("fin-");
        clearApiGetCache();
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(false);

      try {
        const [
          statsRes,
          rateRes,
          trendsRes,
          overdueRes,
          bankStatsRes,
          invStatsRes,
        ] = await Promise.all([
          cachedFetch("fin-stats", () => financeService.getStats()),
          cachedFetch("fin-exchange-rate", () =>
            api.get<ApiResponse<ExchangeRate>, ApiResponse<ExchangeRate>>(
              "/system/exchange-rate",
            ),
          ),
          cachedFetch(`fin-payment-trends-${trendDays}`, () =>
            api.get<
              ApiResponse<PaymentTrendPoint[]>,
              ApiResponse<PaymentTrendPoint[]>
            >(`/finance/payment-trends?days=${trendDays}`),
          ),
          cachedFetch("fin-overdue-receivables", () =>
            api.get<ApiResponse<OverdueItem[]>, ApiResponse<OverdueItem[]>>(
              "/finance/overdue-receivables",
            ),
          ),
          canReadLedger ? getTransactionStats().catch(() => null) : null,
          canReadLedger ? getInvoiceStats().catch(() => null) : null,
        ]);
        setStats(statsRes);
        if (rateRes.data) setExchangeRate(rateRes.data);
        if (trendsRes.data) setTrends(trendsRes.data);
        if (overdueRes.data) setOverdueList(overdueRes.data);
        setBankStats(bankStatsRes);
        setInvStats(invStatsRes);
      } catch (err) {
        console.error("获取财务数据失败:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [trendDays, canReadLedger],
  );

  useEffect(() => {
    void loadData(hasLoadedRef.current);
    hasLoadedRef.current = true;
  }, [loadData]);

  // 计算同比/环比（基于 trends 数组最后两个点）
  const { payableTrend, receivableTrend, payableTrendDir, receivableTrendDir } =
    useMemo(() => {
      if (
        trends.length < 2 ||
        !trends[trends.length - 1] ||
        !trends[trends.length - 2]
      ) {
        return {
          payableTrend: NO_PRIOR_PERIOD,
          receivableTrend: NO_PRIOR_PERIOD,
          payableTrendDir: "neutral" as const,
          receivableTrendDir: "neutral" as const,
        };
      }
      const last = trends[trends.length - 1];
      const prev = trends[trends.length - 2];
      const payable = comparePeriods(last.payables, prev.payables);
      const receivable = comparePeriods(last.receivables, prev.receivables);
      return {
        payableTrend: payable.text,
        receivableTrend: receivable.text,
        payableTrendDir: payable.dir,
        receivableTrendDir: receivable.dir,
      };
    }, [trends]);

  // 应收为 USD、应付为 CNY，统一按当前结算汇率折算为 CNY 后才允许比较和预测。
  const cnyTrends = useMemo(
    () => convertPaymentTrendsToCny(trends, exchangeRate?.effectiveRate || 0),
    [exchangeRate?.effectiveRate, trends],
  );
  const cashFlowForecast = useMemo(
    () => buildCnyCashFlowForecast(cnyTrends),
    [cnyTrends],
  );

  if (loading) {
    return (
      <LoadingState
        title="加载中..."
        description="正在同步财务概览、汇率和账款趋势数据。"
      />
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="财务概览"
          description="公司财务进度、收支健康、成本结构与利润趋势。"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`}
              />
              重试
            </Button>
          }
        />
        <ErrorState
          title="数据加载失败"
          description="无法连接到服务器，请检查网络连接或稍后重试。"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`}
              />
              重试
            </Button>
          }
        />
      </div>
    );
  }

  // 计算完成率与紧迫度
  const payableRate =
    stats && stats.payable.total > 0
      ? Math.round((stats.payable.paid / stats.payable.total) * 100)
      : 0;
  const receivableRate =
    stats && stats.receivable.total > 0
      ? Math.round((stats.receivable.received / stats.receivable.total) * 100)
      : 0;

  // 紧迫性阈值：待付/待收超过总额 50% 时高亮警示
  const payableUrgent = stats
    ? stats.payable.unpaid / Math.max(stats.payable.total, 1) > 0.5
    : false;
  const receivableUrgent = stats
    ? stats.receivable.unreceived / Math.max(stats.receivable.total, 1) > 0.5
    : false;

  const hasData =
    stats && (stats.payable.total > 0 || stats.receivable.total > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="财务概览"
        description="公司财务进度、收支健康、成本结构与利润趋势。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/finance/receivable">
                <Wallet className="mr-1.5 h-4 w-4" />
                应收账款
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/finance/payable">应付账款</Link>
            </Button>
            {canReadLedger && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/finance/statements">查看报表分析</Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
          </div>
        }
      />

      {/* 核心收付 KPI 与结算汇率 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-5">
        <KpiStat
          label="应付账款总额"
          value={`¥${formatAmount(stats?.payable.total ?? 0)}`}
          subLabel={`已付 ¥${formatAmount(stats?.payable.paid ?? 0)} · 完成率 ${payableRate}%`}
          trend={payableTrendDir}
          trendValue={payableTrend}
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
        <KpiStat
          label="待付账款"
          value={`¥${formatAmount(stats?.payable.unpaid ?? 0)}`}
          subLabel={
            payableUrgent ? "超过总额50%，建议优先处理" : "尚未支付给供应商"
          }
          trend={payableUrgent ? "down" : "neutral"}
          trendValue={payableUrgent ? "高风险" : "正常"}
          icon={<Wallet className="h-4 w-4" />}
          valueClassName={payableUrgent ? "text-destructive" : undefined}
        />
        <KpiStat
          label="应收账款总额"
          value={`USD ${formatAmount(stats?.receivable.total ?? 0)}`}
          subLabel={`已收 USD ${formatAmount(stats?.receivable.received ?? 0)} · 完成率 ${receivableRate}%`}
          trend={receivableTrendDir}
          trendValue={receivableTrend}
          icon={<ArrowDownLeft className="h-4 w-4" />}
        />
        <KpiStat
          label="待收账款"
          value={`USD ${formatAmount(stats?.receivable.unreceived ?? 0)}`}
          subLabel={
            receivableUrgent
              ? "当前客户剩余欠款偏高，建议优先跟进"
              : "当前客户剩余欠款"
          }
          trend={receivableUrgent ? "down" : "neutral"}
          trendValue={receivableUrgent ? "需跟进" : "正常"}
          icon={<DollarSign className="h-4 w-4" />}
          valueClassName={receivableUrgent ? "text-status-amber" : undefined}
        />
        <Card className="py-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  当前结算汇率
                </p>
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  {exchangeRate?.effectiveRate != null
                    ? exchangeRate.effectiveRate.toFixed(2)
                    : "—"}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    ¥/$
                  </span>
                </p>
              </div>
              <div className="rounded-lg bg-muted p-2 text-muted-foreground shrink-0">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            {exchangeRate && (
              <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                <p>
                  市场汇率 {exchangeRate.rate?.toFixed(2) ?? "—"} · 风险缓冲{" "}
                  {exchangeRate.buffer?.toFixed(2) ?? "—"}
                </p>
                <p>结算汇率 = 市场汇率 − 风险缓冲，用于美元应收折算人民币</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={financeChartsFallback}>
        <FinanceOverviewCharts
          cnyTrends={cnyTrends}
          cashFlowForecast={cashFlowForecast}
          trendDays={trendDays}
          effectiveRate={exchangeRate?.effectiveRate ?? null}
          onTrendDaysChange={setTrendDays}
        />
      </Suspense>

      {canReadLedger && (
        <Suspense fallback={financeChartsFallback}>
          <MonthlyStatementsTrend />
        </Suspense>
      )}

      {/* 银行流水 & 发票台账摘要 */}
      {(bankStats || invStats) && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {bankStats && (
            <Link href="/dashboard/finance/bank-flow" className="group">
              <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">
                        银行流水（人民币 CNY）
                      </CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">总收入</p>
                      <p className="text-base font-bold text-status-green tabular-nums">
                        ¥
                        {bankStats.totalIn.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">总支出</p>
                      <p className="text-base font-bold text-status-red tabular-nums">
                        ¥
                        {bankStats.totalOut.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">净现金流</p>
                      <p
                        className={`text-base font-bold tabular-nums ${bankStats.netFlow >= 0 ? "text-status-green" : "text-status-red"}`}
                      >
                        ¥
                        {bankStats.netFlow.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">交易笔数</p>
                      <p className="text-base font-bold tabular-nums">
                        {bankStats.txnCount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {invStats && (
            <Link href="/dashboard/finance/invoices" className="group">
              <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium">
                        发票台账
                      </CardTitle>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        有效发票金额
                      </p>
                      <p className="text-base font-bold text-primary tabular-nums">
                        ¥
                        {invStats.validTotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">有效税额</p>
                      <p className="text-base font-bold tabular-nums">
                        ¥
                        {invStats.validTax.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        有效发票数
                      </p>
                      <p className="text-base font-bold tabular-nums">
                        {invStats.validCount.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        已红冲 / 总记录
                      </p>
                      <p className="text-base font-bold tabular-nums text-muted-foreground">
                        {invStats.reversedCount} / {invStats.totalCount}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* 应收逾期预警 */}
      {overdueList.length > 0 && (
        <Card className="border-status-red/40 bg-status-red-soft/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-status-red" />
              <CardTitle className="text-sm font-medium text-status-red">
                应收逾期预警 · {overdueList.length} 单待催收
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              发货 30 天后仍有未回款的合同，建议优先跟进
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueList.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-status-red/50 bg-background px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">
                      {item.contractNo}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs border-status-red/50 text-status-red"
                    >
                      逾期 {item.overdueDays} 天
                    </Badge>
                  </div>
                  <span className="tabular-nums text-status-red font-medium">
                    USD {formatAmount(item.unreceived)}
                  </span>
                </div>
              ))}
              {overdueList.length > 5 && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  还有 {overdueList.length - 5} 条逾期记录，
                  <Link
                    href="/dashboard/finance/receivable"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    查看全部应收明细
                  </Link>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 快捷导航区 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
        <Link href="/dashboard/finance/payable" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">应付账款明细</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    查看各供应商欠款详情与付款登记
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/receivable" className="group">
          <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">应收账款与收款池</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    查看门店待回款、记录到账与自动匹配分配
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {canReadLedger && (
          <Link href="/dashboard/finance/statements" className="group">
            <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm border-primary/20 bg-primary/[0.03]">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-primary">
                      财务报表分析
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      收入利润、成本结构、资产负债
                    </p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {canReadLedger && !bankStats && (
          <Link href="/dashboard/finance/bank-flow" className="group">
            <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">银行流水查询</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      按对方名称、日期查看资金往来
                    </p>
                  </div>
                  <Landmark className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {canReadLedger && !invStats && (
          <Link href="/dashboard/finance/invoices" className="group">
            <Card className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">发票台账查询</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      按销方、状态筛选发票明细
                    </p>
                  </div>
                  <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* 无数据引导态 */}
      {!hasData && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <EmptyState
              icon={DollarSign}
              title="暂无财务记录"
              description="导入采购或出口合同数据后，应付 / 应收账款将自动汇总显示在此。"
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/finance/payable">查看应付明细</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href="/dashboard/finance/receivable">
                      查看应收明细
                    </Link>
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* 账款货币说明 */}
      {hasData && (
        <p className="text-xs text-muted-foreground text-center">
          应付账款以人民币（CNY /
          ¥）计；应收账款以美元（USD）计。汇率数据来自系统配置。
        </p>
      )}
    </div>
  );
}
