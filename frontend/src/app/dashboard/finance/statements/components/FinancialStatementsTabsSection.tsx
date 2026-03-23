/**
 * Input: 财务趋势、账期列表与当前详情
 * Output: 财务报表页标签图表区与历史预警区
 * Pos: 财务报表页主分析区
 */

import { Building2, DollarSign, AlertTriangle, AlertCircle, BarChart3, Loader2, Scale, TrendingUp, Wallet } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AnalyticsData, FinancialPeriod } from '@/services/financialStatements.service';
import { profitColor } from './financialStatementsFormatting';

const COLORS = {
  revenue: '#3b82f6',
  cost: '#f59e0b',
  admin: '#8b5cf6',
  financial: '#06b6d4',
  selling: '#10b981',
  netProfit: '#22c55e',
  assets: '#3b82f6',
  liabilities: '#ef4444',
  equity: '#10b981',
  cash: '#f59e0b',
};

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
    <div className="rounded-lg border bg-background p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      {payload.map((item, index) => (
        <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4">
          <span style={{ color: item.color }} className="font-medium">
            {item.name}
          </span>
          <span className="font-mono text-foreground">
            ¥{Number(item.value).toLocaleString('zh-CN', { minimumFractionDigits: 0 })}
          </span>
        </div>
      ))}
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
  return (
    <>
      <div data-testid="financial-statements-tabs">
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trends">收益趋势</TabsTrigger>
            <TabsTrigger value="expenses">费用结构</TabsTrigger>
            <TabsTrigger value="balance">资产负债</TabsTrigger>
            <TabsTrigger value="detail">账期详情</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4">
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
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="revenue" name="营业收入" fill={COLORS.revenue} fillOpacity={0.1} stroke={COLORS.revenue} strokeWidth={2} />
                    <Line type="monotone" dataKey="netProfit" name="净利润" stroke={COLORS.netProfit} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
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
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12 }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="revenueYTD" name="营收累计" stroke={COLORS.revenue} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="netProfitYTD" name="净利润累计" stroke={COLORS.netProfit} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses">
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
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12 }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="costOfSales" name="营业成本" stackId="a" fill={COLORS.cost} />
                    <Bar dataKey="adminExpenses" name="管理费用" stackId="a" fill={COLORS.admin} />
                    <Bar dataKey="financialExpenses" name="财务费用" stackId="a" fill={COLORS.financial} />
                    <Bar dataKey="sellingExpenses" name="销售费用" stackId="a" fill={COLORS.selling} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="balance" className="space-y-4">
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
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12 }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
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
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} tick={{ fontSize: 12 }} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="cash" name="货币资金" stroke={COLORS.cash} fill={COLORS.cash} fillOpacity={0.15} strokeWidth={2} />
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
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 12 }} domain={[0, 1.2]} />
                      <Tooltip
                        formatter={(value: number | string | undefined) => [
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
          </TabsContent>

          <TabsContent value="detail">
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
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">请在上方选择账期查看详情</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
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
