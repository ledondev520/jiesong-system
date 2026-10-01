/**
 * Input: 财务趋势、账期列表与当前详情
 * Output: 财务总览页内下钻图表区与历史预警区
 * Pos: 财务报表主分析区
 */

import { useBusinessReadOnly } from '@/lib/hooks/useBusinessReadOnly';
import { Building2, DollarSign, AlertTriangle, AlertCircle, BarChart3, BookOpen, FileCheck2, Loader2, Scale, TrendingUp, Wallet, PieChart as PieChartIcon, Activity } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { AnalyticsData, FinancialPeriod } from '@/services/financialStatements.service';
import { profitColor } from './financialStatementsFormatting';

const COLORS = {
  revenue: '#10b981',
  cost: '#f59e0b',
  admin: '#8b5cf6',
  financial: '#06b6d4',
  selling: '#3b82f6',
  netProfit: '#22c55e',
  assets: '#3b82f6',
  liabilities: '#ef4444',
  equity: '#10b981',
  cash: '#f59e0b',
};

const PIE_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#3b82f6'];

function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card/95 px-4 py-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-muted-foreground">{item.name}</span>
            </div>
            <span className="font-mono font-bold text-foreground">
              ¥{Number(item.value).toLocaleString('zh-CN', { minimumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BalanceSheetTable({ bs }: { bs: NonNullable<FinancialPeriod['balanceSheet']> }) {
  const rows = [
    { label: '货币资金', value: bs.cashAndEquivalents, section: '流动资产' },
    { label: '短期投资', value: bs.shortTermInvestments, section: '' },
    { label: '应收账款', value: bs.accountsReceivable, section: '' },
    { label: '预付账款', value: bs.prepaidExpenses, section: '' },
    { label: '其他应收款', value: bs.otherReceivables, section: '' },
    { label: '存货', value: bs.inventory, section: '' },
    { label: '流动资产合计', value: bs.totalCurrentAssets, section: '', bold: true },
    { label: '非流动资产合计', value: bs.totalNonCurrentAssets, section: '非流动资产', bold: true },
    { label: '资产合计', value: bs.totalAssets, section: '', bold: true, highlight: true },
    null,
    { label: '应付账款', value: bs.accountsPayable, section: '流动负债' },
    { label: '预收账款', value: bs.advancedReceipts, section: '' },
    { label: '应付职工薪酬', value: bs.staffWagesPayable, section: '' },
    { label: '应交税费', value: bs.taxesPayable, section: '' },
    { label: '其他应付款', value: bs.otherPayables, section: '' },
    { label: '流动负债合计', value: bs.totalCurrentLiabilities, section: '', bold: true },
    { label: '非流动负债合计', value: bs.totalNonCurrentLiabilities, section: '非流动负债', bold: true },
    { label: '负债合计', value: bs.totalLiabilities, section: '', bold: true, highlight: true },
    null,
    { label: '实收资本', value: bs.paidInCapital, section: '所有者权益' },
    { label: '资本公积', value: bs.capitalReserve, section: '' },
    { label: '盈余公积', value: bs.surplusReserve, section: '' },
    { label: '未分配利润', value: bs.retainedEarnings, section: '', valueClass: profitColor(bs.retainedEarnings) },
    { label: '所有者权益合计', value: bs.totalEquity, section: '', bold: true, highlight: true, valueClass: profitColor(bs.totalEquity) },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-3 text-left font-medium text-muted-foreground">科目</th>
            <th className="py-3 text-right font-medium text-muted-foreground">金额（元）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (row === null) {
              return (
                <tr key={index}>
                  <td colSpan={2} className="py-1">
                    <Separator />
                  </td>
                </tr>
              );
            }

            return (
              <tr
                key={index}
                className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${
                  row.highlight ? 'bg-muted/20' : ''
                }`}
              >
                <td
                  className={`py-1.5 ${
                    row.section ? 'text-xs text-muted-foreground' : 'pl-3'
                  } ${row.bold ? 'pl-0 font-semibold text-foreground' : ''}`}
                >
                  {row.section ? `【${row.section}】` : row.label}
                  {row.section ? <div className="pl-3 font-normal text-foreground">{row.label}</div> : null}
                </td>
                <td className={`py-1.5 text-right font-mono ${row.valueClass ?? ''} ${row.bold ? 'font-semibold' : ''}`}>
                  {row.value !== null && row.value !== undefined ? (
                    row.value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IncomeStatementTable({ statement }: { statement: NonNullable<FinancialPeriod['incomeStatement']> }) {
  const rows = [
    { label: '营业收入', month: statement.revenueMonth, ytd: statement.revenueYTD },
    { label: '  营业成本', month: statement.costOfSalesMonth, ytd: statement.costOfSalesYTD, indent: true },
    { label: '  税金及附加', month: statement.taxesMonth, ytd: statement.taxesYTD, indent: true },
    { label: '  销售费用', month: statement.sellingExpensesMonth, ytd: statement.sellingExpensesYTD, indent: true },
    { label: '  管理费用', month: statement.adminExpensesMonth, ytd: statement.adminExpensesYTD, indent: true },
    { label: '  财务费用', month: statement.financialExpensesMonth, ytd: statement.financialExpensesYTD, indent: true },
    { label: '  投资收益', month: statement.investmentIncomeMonth, ytd: statement.investmentIncomeYTD, indent: true },
    null,
    { label: '营业利润', month: statement.operatingProfitMonth, ytd: statement.operatingProfitYTD, bold: true, profitField: true },
    { label: '  营业外收入', month: statement.nonOperatingIncomeMonth, ytd: statement.nonOperatingIncomeYTD, indent: true },
    { label: '  营业外支出', month: statement.nonOperatingExpensesMonth, ytd: statement.nonOperatingExpensesYTD, indent: true },
    null,
    { label: '利润总额', month: statement.totalProfitMonth, ytd: statement.totalProfitYTD, bold: true, profitField: true },
    { label: '  所得税费用', month: statement.incomeTaxMonth, ytd: statement.incomeTaxYTD, indent: true },
    null,
    { label: '净利润', month: statement.netProfitMonth, ytd: statement.netProfitYTD, bold: true, highlight: true, profitField: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-3 text-left font-medium text-muted-foreground">项目</th>
            <th className="py-3 text-right font-medium text-muted-foreground">本月金额（元）</th>
            <th className="py-3 text-right font-medium text-muted-foreground">本年累计（元）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            if (row === null) {
              return (
                <tr key={index}>
                  <td colSpan={3} className="py-1">
                    <Separator />
                  </td>
                </tr>
              );
            }

            const monthClass = row.profitField ? profitColor(row.month) : '';
            const ytdClass = row.profitField ? profitColor(row.ytd) : '';

            return (
              <tr
                key={index}
                className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${
                  row.highlight ? 'bg-muted/20' : ''
                }`}
              >
                <td className={`py-1.5 ${row.indent ? 'pl-6 text-muted-foreground' : ''} ${row.bold ? 'font-semibold' : ''}`}>
                  {row.label}
                </td>
                <td className={`py-1.5 text-right font-mono ${monthClass} ${row.bold ? 'font-semibold' : ''}`}>
                  {row.month !== null && row.month !== undefined ? (
                    row.month.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`py-1.5 text-right font-mono ${ytdClass} ${row.bold ? 'font-semibold' : ''}`}>
                  {row.ytd !== null && row.ytd !== undefined ? (
                    row.ytd.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function amount(value: number | null | undefined) {
  return value === null || value === undefined
    ? <span className="text-muted-foreground">—</span>
    : value.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
}

function CashFlowTable({ statement }: { statement: NonNullable<FinancialPeriod['cashFlowStatement']> }) {
  const rows = [
    ['销售商品、提供劳务收到的现金', statement.salesCashMonth, statement.salesCashYTD],
    ['收到的其他经营活动现金', statement.otherOperatingCashInflowMonth, statement.otherOperatingCashInflowYTD],
    ['购买商品、接受劳务支付的现金', statement.purchaseCashPaidMonth, statement.purchaseCashPaidYTD],
    ['支付给职工及为职工支付的现金', statement.employeeCashPaidMonth, statement.employeeCashPaidYTD],
    ['支付的各项税费', statement.taxCashPaidMonth, statement.taxCashPaidYTD],
    ['支付的其他经营活动现金', statement.otherOperatingCashPaidMonth, statement.otherOperatingCashPaidYTD],
    ['经营活动产生的现金流量净额', statement.netOperatingCashFlowMonth, statement.netOperatingCashFlowYTD],
    ['投资活动产生的现金流量净额', statement.netInvestingCashFlowMonth, statement.netInvestingCashFlowYTD],
    ['筹资活动产生的现金流量净额', statement.netFinancingCashFlowMonth, statement.netFinancingCashFlowYTD],
    ['现金及现金等价物净增加额', statement.netCashIncreaseMonth, statement.netCashIncreaseYTD],
    ['期初现金及现金等价物余额', statement.openingCashMonth, statement.openingCashYTD],
    ['期末现金及现金等价物余额', statement.endingCashMonth, statement.endingCashYTD],
  ] as const;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-3 text-left font-medium text-muted-foreground">项目</th>
            <th className="py-3 text-right font-medium text-muted-foreground">本月金额（元）</th>
            <th className="py-3 text-right font-medium text-muted-foreground">本年累计（元）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, month, ytd], index) => (
            <tr key={label} className={`border-b border-border/50 hover:bg-muted/30 ${index >= 6 ? 'font-semibold' : ''}`}>
              <td className="py-1.5 pr-4">{label}</td>
              <td className="py-1.5 text-right font-mono">{amount(month)}</td>
              <td className="py-1.5 text-right font-mono">{amount(ytd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountBalancesTable({ rows }: { rows: NonNullable<FinancialPeriod['accountBalances']> }) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded-md border">
      <table className="min-w-[980px] w-full text-xs">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b">
            <th className="px-3 py-2 text-left">科目</th>
            {['期初借方', '期初贷方', '本期借方', '本期贷方', '本年借方', '本年贷方', '期末借方', '期末贷方'].map((label) => (
              <th key={label} className="px-3 py-2 text-right font-medium text-muted-foreground">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? row.sourceRow} className={`border-b border-border/50 hover:bg-muted/30 ${row.rowType !== 'ACCOUNT' ? 'bg-muted/20 font-semibold' : ''}`}>
              <td className="whitespace-nowrap px-3 py-1.5">
                <span className="font-mono text-muted-foreground">{row.accountCode ?? ''}</span>{' '}{row.accountName}
              </td>
              {[row.openingDebit, row.openingCredit, row.periodDebit, row.periodCredit, row.yearDebit, row.yearCredit, row.endingDebit, row.endingCredit].map((value, index) => (
                <td key={index} className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{amount(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeneralLedgerTable({ rows }: { rows: NonNullable<FinancialPeriod['generalLedgerEntries']> }) {
  return (
    <div className="max-h-[36rem] overflow-auto rounded-md border">
      <table className="min-w-[1040px] w-full text-xs">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b">
            {['科目', '日期', '凭证字号', '摘要', '借方', '贷方', '方向', '余额'].map((label) => (
              <th key={label} className={`px-3 py-2 font-medium text-muted-foreground ${['借方', '贷方', '余额'].includes(label) ? 'text-right' : 'text-left'}`}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? row.sourceRow} className={`border-b border-border/50 hover:bg-muted/30 ${row.rowType !== 'ENTRY' ? 'bg-muted/20 font-semibold' : ''}`}>
              <td className="whitespace-nowrap px-3 py-1.5"><span className="font-mono text-muted-foreground">{row.accountCode}</span> {row.accountName}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{row.entryDate ? new Date(row.entryDate).toLocaleDateString('zh-CN') : '—'}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{row.voucherNumber || '—'}</td>
              <td className="min-w-52 px-3 py-1.5">{row.summary}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{amount(row.debit)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{amount(row.credit)}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{row.direction || '—'}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{amount(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataSourceList({ sources }: { sources: NonNullable<FinancialPeriod['dataSources']> }) {
  const labels = { STATEMENT: '会计报表', TRIAL_BALANCE: '科目余额表', GENERAL_LEDGER: '明细账' };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {sources.map((source) => (
        <div key={source.id} className="rounded-lg border bg-muted/10 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary">{labels[source.type]}</Badge>
            <span className="text-xs text-muted-foreground">{source.rowCount.toLocaleString('zh-CN')} 行</span>
          </div>
          <p className="mt-2 break-all font-medium">{source.fileName}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">SHA-256 {source.sha256.slice(0, 12)}… · {(source.fileSize / 1024).toFixed(1)} KB</p>
        </div>
      ))}
    </div>
  );
}

interface FinancialStatementsTabsSectionProps {
  analytics: AnalyticsData;
  periods: FinancialPeriod[];
  currentDetail: FinancialPeriod | null;
  detailLoading: boolean;
}

export function FinancialStatementsTabsSection({
  analytics,
  periods,
  currentDetail,
  detailLoading,
}: FinancialStatementsTabsSectionProps) {
  const readOnly = useBusinessReadOnly();
  // 支出分类占比数据（取最新一期）
  const latestTrend = analytics.trends[analytics.trends.length - 1];
  const expensePieData = latestTrend
    ? [
        { name: '营业成本', value: latestTrend.costOfSales, color: PIE_COLORS[0] },
        { name: '管理费用', value: latestTrend.adminExpenses, color: PIE_COLORS[1] },
        { name: '财务费用', value: latestTrend.financialExpenses, color: PIE_COLORS[2] },
        { name: '销售费用', value: latestTrend.sellingExpenses, color: PIE_COLORS[3] },
      ].filter((d) => d.value > 0)
    : [];

  // 最近 10 期经营指标（带状态标签）
  const recentMetrics = [...analytics.trends].reverse().slice(0, 10).map((t) => {
    const profitRate = t.revenue > 0 ? (t.netProfit / t.revenue) * 100 : 0;
    return {
      label: t.label,
      revenue: t.revenue,
      cost: t.costOfSales + t.adminExpenses + t.financialExpenses + t.sellingExpenses,
      profit: t.netProfit,
      profitRate,
      status: t.netProfit >= 0 ? ('profit' as const) : ('loss' as const),
    };
  });

  return (
    <>
      <div data-testid="financial-statements-drilldowns" className="space-y-6">
        <section id="finance-income-profit" className="scroll-mt-24 space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">收入与利润趋势</h3>
            <p className="text-sm text-muted-foreground">下钻查看营业收入、净利润与最近账期经营状态。</p>
          </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  月度营收 vs 净利润趋势
                </CardTitle>
                <CardDescription>各月本月营业收入与净利润对比（元）</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={analytics.trends} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                    <Bar dataKey="revenue" name="营业收入" fill={COLORS.revenue} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="netProfit" name="净利润" stroke={COLORS.netProfit} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.netProfit, strokeWidth: 2, stroke: 'var(--background)' }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  本年累计营收 vs 净利润
                </CardTitle>
                <CardDescription>截至每月末的本年累计数据（元）</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart
                    data={analytics.trends.map((trend) => {
                      const period = periods.find((item) => item.year === trend.year && item.month === trend.month);
                      return {
                        ...trend,
                        revenueYTD: period?.incomeStatement?.revenueYTD ?? 0,
                        netProfitYTD: period?.incomeStatement?.netProfitYTD ?? 0,
                      };
                    })}
                    margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="revenueYTD" name="营收累计" stroke={COLORS.revenue} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="netProfitYTD" name="净利润累计" stroke={COLORS.netProfit} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 最近经营指标表 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4 text-primary" />
                  最近经营指标
                </CardTitle>
                <CardDescription className="text-xs">最近 {recentMetrics.length} 期营收、成本与利润状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 text-left font-medium text-muted-foreground">账期</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">营业收入</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">总费用</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">净利润</th>
                        <th className="py-2 text-right font-medium text-muted-foreground">净利率</th>
                        <th className="py-2 text-left font-medium text-muted-foreground">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMetrics.map((m) => (
                        <tr key={m.label} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                          <td className="py-1.5 font-medium">{m.label}</td>
                          <td className="py-1.5 text-right tabular-nums">¥{m.revenue.toLocaleString()}</td>
                          <td className="py-1.5 text-right tabular-nums text-red-600">¥{m.cost.toLocaleString()}</td>
                          <td className={`py-1.5 text-right tabular-nums font-semibold ${m.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ¥{m.profit.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{m.profitRate.toFixed(1)}%</td>
                          <td className="py-1.5">
                            {m.status === 'profit' ? (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]">盈利</Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]">亏损</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
        </section>

        <section id="finance-cost-structure" className="scroll-mt-24 space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">成本结构</h3>
            <p className="text-sm text-muted-foreground">下钻查看营业成本、管理费用、财务费用与销售费用构成。</p>
          </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    月度费用结构
                  </CardTitle>
                  <CardDescription>营业成本 + 管理费用 + 财务费用 + 销售费用（元）</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={analytics.trends} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar dataKey="costOfSales" name="营业成本" stackId="a" fill={COLORS.cost} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="adminExpenses" name="管理费用" stackId="a" fill={COLORS.admin} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="financialExpenses" name="财务费用" stackId="a" fill={COLORS.financial} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="sellingExpenses" name="销售费用" stackId="a" fill={COLORS.selling} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-primary" />
                    支出分类占比
                  </CardTitle>
                  <CardDescription>最新账期各项费用占比分布</CardDescription>
                </CardHeader>
                <CardContent>
                  {expensePieData.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                      <span className="rounded-full bg-muted/50 p-3">
                        <PieChartIcon className="h-5 w-5 text-muted-foreground/50" />
                      </span>
                      <p className="text-sm text-muted-foreground/60">暂无费用数据</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={360}>
                      <PieChart>
                        <Tooltip
                          formatter={(value: unknown, name: unknown) => [
                            `¥${Number(value ?? 0).toLocaleString('zh-CN')}`,
                            String(name),
                          ]}
                        />
                        <Legend />
                        <Pie
                          data={expensePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={120}
                          paddingAngle={3}
                          strokeWidth={2}
                          stroke="var(--background)"
                        >
                          {expensePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
        </section>

        <section id="finance-balance" className="scroll-mt-24 space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">资产负债</h3>
            <p className="text-sm text-muted-foreground">下钻查看资产、负债、权益、货币资金与资产负债率趋势。</p>
          </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  资产 / 负债 / 权益 趋势
                </CardTitle>
                <CardDescription>期末资产合计、负债合计与所有者权益变化</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={analytics.trends} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="totalAssets" name="资产合计" stroke={COLORS.assets} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="totalLiabilities" name="负债合计" stroke={COLORS.liabilities} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="totalEquity" name="所有者权益" stroke={COLORS.equity} strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-4 w-4 text-primary" />
                    货币资金趋势
                  </CardTitle>
                  <CardDescription>期末货币资金余额变化</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={analytics.trends} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.cash} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={COLORS.cash} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="cash" name="货币资金" stroke={COLORS.cash} fill="url(#cashGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Scale className="h-4 w-4 text-primary" />
                    资产负债率趋势
                  </CardTitle>
                  <CardDescription>各月资产负债率变化（警戒线 70%）</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={analytics.trends} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} domain={[0, 1.2]} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          fontSize: '13px',
                        }}
                        formatter={(value) => [
                          value !== undefined ? `${(Number(value) * 100).toFixed(1)}%` : '—',
                          '资产负债率',
                        ]}
                      />
                      <ReferenceLine y={0.7} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '70%警戒线', fill: '#ef4444', fontSize: 11 }} />
                      <Line type="monotone" dataKey="debtRatio" name="资产负债率" stroke={COLORS.liabilities} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
        </section>

        <section id="finance-period-detail" className="scroll-mt-24 space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">账期详情</h3>
            <p className="text-sm text-muted-foreground">下钻查看当前账期的三张报表、科目余额、明细账与来源校验。</p>
          </div>
            {detailLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                加载账期详情...
              </div>
            ) : currentDetail ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        资产负债表
                      </span>
                      <Badge variant="outline">{currentDetail.periodLabel}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentDetail.balanceSheet ? (
                      <BalanceSheetTable bs={currentDetail.balanceSheet} />
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无数据</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" />
                        利润表
                      </span>
                      <Badge variant="outline">{currentDetail.periodLabel}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentDetail.incomeStatement ? (
                      <IncomeStatementTable statement={currentDetail.incomeStatement} />
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无数据</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />现金流量表</span>
                      <Badge variant="outline">{currentDetail.periodLabel}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentDetail.cashFlowStatement ? <CashFlowTable statement={currentDetail.cashFlowStatement} /> : <p className="text-sm text-muted-foreground">该账期来源文件未包含现金流量表</p>}
                  </CardContent>
                </Card>

                {!readOnly && (<Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-primary" />科目余额表（{currentDetail.accountBalances?.length ?? 0} 行）</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentDetail.accountBalances?.length ? <AccountBalancesTable rows={currentDetail.accountBalances} /> : <p className="text-sm text-muted-foreground">暂无数据</p>}
                  </CardContent>
                </Card>)}

                {!readOnly && (<Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />明细账（{currentDetail.generalLedgerEntries?.length ?? 0} 行）</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentDetail.generalLedgerEntries?.length ? <GeneralLedgerTable rows={currentDetail.generalLedgerEntries} /> : <p className="text-sm text-muted-foreground">暂无数据</p>}
                  </CardContent>
                </Card>)}

                {!readOnly && (<Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />来源校验（{currentDetail.dataSources?.length ?? 0} 份）</CardTitle>
                    <CardDescription>保留文件名、行数、大小和摘要，用于追溯本账期数据来源。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {currentDetail.dataSources?.length ? <DataSourceList sources={currentDetail.dataSources} /> : <p className="text-sm text-muted-foreground">暂无来源记录</p>}
                  </CardContent>
                </Card>)}
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">请在上方选择账期查看详情</p>
                </CardContent>
              </Card>
            )}
        </section>
      </div>

      {analytics.historicalAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              历史预警记录
            </CardTitle>
            <CardDescription>全年各月财务异常汇总（共 {analytics.historicalAlerts.length} 条）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {[...analytics.historicalAlerts].reverse().map((alert, index) => (
                <div
                  key={`${alert.code}-${index}`}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                    alert.level === 'danger'
                      ? 'border-destructive/20 bg-destructive/5'
                      : 'border-amber-200/50 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/20'
                  }`}
                >
                  {alert.level === 'danger' ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{alert.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
