/**
 * Input: 财务报表页共享格式化逻辑、预警、表格与图表提示配置
 * Output: 可复用的财务报表展示子组件
 * Pos: 财务报表页共享展示层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import type { ComponentType } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { FinancialAlert, FinancialPeriod } from '@/services/financialStatements.service';

export type StatementsBalanceSheet = NonNullable<FinancialPeriod['balanceSheet']>;
export type StatementsIncomeStatement = NonNullable<FinancialPeriod['incomeStatement']>;

export const CHART_COLORS = {
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
} as const;

export function fmtAmount(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtWan(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  const wan = val / 10000;
  return `¥${wan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万`;
}

export function fmtPercent(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

export function profitColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'text-muted-foreground';
  return val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
}

export function KpiCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
  valueClass,
}: {
  title: string;
  value: string;
  subValue?: string;
  icon: ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  valueClass?: string;
}) {
  return (
    <Card className="kpi-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight ${valueClass ?? ''}`}>{value}</div>
        {subValue && (
          <div className="mt-1 flex items-center gap-1">
            {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
            {trend === 'down' && <TrendingDown className="h-3 w-3 text-destructive" />}
            <p className="text-xs text-muted-foreground">{subValue}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AlertItem({ alert }: { alert: FinancialAlert }) {
  const isError = alert.level === 'danger';

  return (
    <Alert variant={isError ? 'destructive' : 'default'} className="border-l-4 border-l-current">
      <div className="flex items-start gap-2">
        {isError ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          <AlertTitle className="text-sm font-semibold">
            <Badge variant={isError ? 'destructive' : 'outline'} className="mr-2 text-xs">
              {isError ? '严重' : '警告'}
            </Badge>
            {alert.message}
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs text-muted-foreground">
            {alert.detail}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}

export const ChartTooltipContent = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; unit?: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;

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
};

export function FinancialHealthAlert({ periodLabel }: { periodLabel?: string | null }) {
  return (
    <Alert className="border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      <AlertTitle className="text-emerald-700 dark:text-emerald-400">财务状况良好</AlertTitle>
      <AlertDescription className="text-xs text-emerald-600/80 dark:text-emerald-500/80">
        {periodLabel} 各项财务指标均在安全范围内
      </AlertDescription>
    </Alert>
  );
}

export function BalanceSheetTable({ bs }: { bs: StatementsBalanceSheet }) {
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
                <td
                  className={`py-1.5 text-right font-mono ${row.valueClass ?? ''} ${
                    row.bold ? 'font-semibold' : ''
                  }`}
                >
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

export function IncomeStatementTable({ statement }: { statement: StatementsIncomeStatement }) {
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
