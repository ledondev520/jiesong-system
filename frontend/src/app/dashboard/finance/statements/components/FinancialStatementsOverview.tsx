/**
 * Input: 财务报表概览数据、操作回调与状态
 * Output: 可独立或嵌入展示的页面头部、空态、预警、KPI 与营运资金概览
 * Pos: 财务报表概览分区
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  ArrowRightLeft,
  BarChart3,
  DollarSign,
  Loader2,
  Package,
  Scale,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react';
import type { AnalyticsData, FinancialAlert, FinancialPeriod } from '@/services/financialStatements.service';
import {
  AlertItem,
  FinancialHealthAlert,
  fmtAmount,
  fmtPercent,
  fmtWan,
  KpiCard,
  profitColor,
  type StatementsBalanceSheet,
  type StatementsIncomeStatement,
} from './FinancialStatementsShared';

interface FinancialStatementsLoadingStateProps {
  count?: number;
}

export function FinancialStatementsLoadingState({
  count = 4,
}: FinancialStatementsLoadingStateProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(count)].map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}

interface FinancialStatementsOverviewProps {
  analytics: AnalyticsData | null;
  currentDetail: FinancialPeriod | null;
  currentPeriod: FinancialPeriod | null;
  dangerAlerts: FinancialAlert[];
  debtRatioVal: number | null;
  detailLoading: boolean;
  hasData: boolean;
  latestBalanceSheet: StatementsBalanceSheet | null | undefined;
  latestIncomeStatement: StatementsIncomeStatement | null | undefined;
  onOpenUploadDialog: () => void;
  onSelectPeriod: (value: string) => void;
  periods: FinancialPeriod[];
  selectedPeriod: string;
  showHeader?: boolean;
  warningAlerts: FinancialAlert[];
}

function calcTrend(current: number | null | undefined, previous: number | null | undefined): { dir: 'up' | 'down' | 'neutral'; text: string } {
  if (current == null || previous == null || previous === 0) return { dir: 'neutral', text: '环比持平' };
  const diff = ((current - previous) / Math.abs(previous)) * 100;
  const sign = diff > 0 ? '+' : '';
  if (Math.abs(diff) < 0.1) return { dir: 'neutral', text: '环比持平' };
  return {
    dir: diff > 0 ? 'up' : 'down',
    text: `环比 ${sign}${diff.toFixed(1)}%`,
  };
}

export function FinancialStatementsOverview({
  analytics,
  currentDetail,
  currentPeriod,
  dangerAlerts,
  debtRatioVal,
  detailLoading,
  hasData,
  latestBalanceSheet,
  latestIncomeStatement,
  onOpenUploadDialog,
  onSelectPeriod,
  periods,
  selectedPeriod,
  showHeader = true,
  warningAlerts,
}: FinancialStatementsOverviewProps) {
  return (
    <>
      {showHeader && (
        <PageHeader
          title="财务报表分析"
          description="月度会计数据看板：资产负债表 · 利润表 · 智能预警"
          actions={
            <div className="flex items-center gap-2">
              {hasData && (
                <Select value={selectedPeriod} onValueChange={onSelectPeriod}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="选择账期" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((period) => (
                      <SelectItem key={period.id} value={`${period.year}-${period.month}`}>
                        {period.periodLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={onOpenUploadDialog} variant="default" className="h-10">
                <Upload className="mr-2 h-4 w-4" />
                上传月度会计报表
              </Button>
            </div>
          }
        />
      )}

      {!hasData && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
            <BarChart3 className="h-16 w-16 text-muted-foreground/40" />
            <div className="text-center">
              <p className="text-lg font-semibold text-muted-foreground">暂无财务报表数据</p>
              <p className="mt-1 text-sm text-muted-foreground">
                点击上方&ldquo;上传月度会计报表&rdquo;，先核对解析预览，再确认写入账期
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <>
          {(dangerAlerts.length > 0 || warningAlerts.length > 0) && (
            <div className="space-y-2">
              {dangerAlerts.map((alert, index) => (
                <AlertItem key={`danger-${index}`} alert={alert} />
              ))}
              {warningAlerts.map((alert, index) => (
                <AlertItem key={`warning-${index}`} alert={alert} />
              ))}
            </div>
          )}

          {dangerAlerts.length === 0 && warningAlerts.length === 0 && (
            <FinancialHealthAlert periodLabel={analytics?.latestPeriod?.periodLabel} />
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {detailLoading && (
              <div className="col-span-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载账期数据...
              </div>
            )}
            {(() => {
              const trends = analytics?.trends ?? [];
              const prev = trends.length >= 2 ? trends[trends.length - 2] : null;
              const revenueTrend = calcTrend(latestIncomeStatement?.revenueMonth, prev?.revenue);
              const profitTrend = calcTrend(latestIncomeStatement?.netProfitMonth, prev?.netProfit);
              const prevDebtRatio = prev && prev.totalAssets ? prev.totalLiabilities / prev.totalAssets : null;
              const debtTrend = calcTrend(debtRatioVal, prevDebtRatio);
              const equityTrend = calcTrend(latestBalanceSheet?.totalEquity, prev?.totalEquity);

              return (
                <>
                  <KpiCard
                    title={`本期营业收入（${currentDetail?.periodLabel ?? currentPeriod?.periodLabel ?? ''}）`}
                    value={fmtWan(latestIncomeStatement?.revenueMonth)}
                    subValue={`累计：${fmtWan(latestIncomeStatement?.revenueYTD)}`}
                    icon={TrendingUp}
                    trend={revenueTrend.dir}
                    trendValue={revenueTrend.text}
                  />
                  <KpiCard
                    title="本期净利润"
                    value={fmtWan(latestIncomeStatement?.netProfitMonth)}
                    subValue={`累计：${fmtWan(latestIncomeStatement?.netProfitYTD)}`}
                    icon={DollarSign}
                    valueClass={profitColor(latestIncomeStatement?.netProfitMonth)}
                    trend={profitTrend.dir}
                    trendValue={profitTrend.text}
                  />
                  <KpiCard
                    title="资产负债率"
                    value={fmtPercent(debtRatioVal)}
                    subValue={`负债 ${fmtWan(latestBalanceSheet?.totalLiabilities)} / 资产 ${fmtWan(latestBalanceSheet?.totalAssets)}`}
                    icon={Scale}
                    valueClass={debtRatioVal != null && debtRatioVal > 0.7 ? 'text-destructive' : 'text-foreground'}
                    trend={debtTrend.dir}
                    trendValue={debtTrend.text}
                  />
                  <KpiCard
                    title="所有者权益"
                    value={fmtWan(latestBalanceSheet?.totalEquity)}
                    subValue={`货币资金：${fmtAmount(latestBalanceSheet?.cashAndEquivalents)}`}
                    icon={Wallet}
                    valueClass={profitColor(latestBalanceSheet?.totalEquity)}
                    trend={equityTrend.dir}
                    trendValue={equityTrend.text}
                  />
                </>
              );
            })()}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                营运资金指标
                {(currentDetail?.periodLabel ?? currentPeriod?.periodLabel) && (
                  <Badge variant="outline" className="ml-auto font-normal">
                    {currentDetail?.periodLabel ?? currentPeriod?.periodLabel}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>应收账款、存货、应付账款等流动性关键项</CardDescription>
            </CardHeader>
            <CardContent>
              {detailLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: '应收账款', value: latestBalanceSheet?.accountsReceivable, icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400' },
                    { label: '预付账款', value: latestBalanceSheet?.prepaidExpenses, icon: ArrowRightLeft, color: 'text-purple-600 dark:text-purple-400' },
                    { label: '其他应收款', value: latestBalanceSheet?.otherReceivables, icon: ArrowRightLeft, color: 'text-indigo-600 dark:text-indigo-400' },
                    { label: '存货', value: latestBalanceSheet?.inventory, icon: Package, color: 'text-amber-600 dark:text-amber-400' },
                    { label: '应付账款', value: latestBalanceSheet?.accountsPayable, icon: TrendingDown, color: 'text-rose-600 dark:text-rose-400' },
                    { label: '其他应付款', value: latestBalanceSheet?.otherPayables, icon: TrendingDown, color: 'text-orange-600 dark:text-orange-400' },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1 rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-sm font-semibold tabular-nums ${item.value != null ? item.color : 'text-muted-foreground'}`}>
                        {item.value != null
                          ? `¥${(item.value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万`
                          : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
