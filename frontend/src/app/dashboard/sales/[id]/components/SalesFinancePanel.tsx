/**
 * Input: 单柜财务汇总 Interface 与美元收款写入 Interface
 * Output: 收入、采购成本、退税、商品毛利、现金流和逐笔收付的一站式结算界面
 * Pos: 出口专项单详情页唯一财务主界面，替代重复的只读收款列表
 */

'use client';

import { BusinessWrite } from '@/lib/hooks/useBusinessReadOnly';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  BanknoteArrowDown,
  CircleDollarSign,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { PaymentType } from '@/types';
import { salesService, type SalesFinanceSummary } from '@/services/sales.service';
import { financeService } from '@/services/finance.service';
import { formatDate } from '@/lib/date-format';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PaymentDialog,
  type PaymentSubmitData,
} from '@/app/dashboard/finance/components/PaymentDialog';

interface SalesFinancePanelProps {
  salesContractId: string;
  contractNo: string;
  onChanged?: () => void | Promise<void>;
}

const amountFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatAmount = (currency: 'USD' | 'CNY', value: number) => (
  `${currency} ${amountFormatter.format(Number(value || 0))}`
);

const issueTone = (severity: 'error' | 'warning' | 'info') => {
  if (severity === 'error') return 'danger' as const;
  if (severity === 'warning') return 'warning' as const;
  return 'info' as const;
};

export function SalesFinancePanel({
  salesContractId,
  contractNo,
  onChanged,
}: SalesFinancePanelProps) {
  const [summary, setSummary] = useState<SalesFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await salesService.getFinanceSummary(salesContractId);
      setSummary(response.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [salesContractId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleReceipt = async (data: PaymentSubmitData) => {
    try {
      await financeService.createPayment({
        type: PaymentType.RECEIVABLE,
        salesContractId,
        amount: Number(data.amount),
        currency: 'USD',
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note: data.note,
      });
      setPaymentOpen(false);
      toast.success('美元收款已登记');
      await loadSummary();
      await onChanged?.();
    } catch {
      toast.error('登记美元收款失败');
      throw new Error('登记美元收款失败');
    }
  };

  if (loading && !summary) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="财务结算加载中">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full" />
        ))}
      </div>
    );
  }

  if (loadError || !summary) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>单柜财务汇总加载失败</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>现有财务数据没有被修改，可以重新读取。</span>
          <Button variant="outline" size="sm" onClick={() => void loadSummary()}>
            <RefreshCw className="h-4 w-4" />
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const issueErrors = summary.issues.filter((issue) => issue.severity === 'error');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <CardTitle>
              <h2 className="flex items-center gap-2 text-base">
                <CircleDollarSign className="h-5 w-5 text-primary" />
                单柜财务结算
              </h2>
            </CardTitle>
            <CardDescription>
              收款固定按 USD，采购付款固定按 CNY；人民币结果使用合同汇率
              {summary.currencyPolicy.conversionRate
                ? ` ${summary.currencyPolicy.conversionRate.toFixed(4)}`
                : '（未录入）'}。
            </CardDescription>
          </div>
          <BusinessWrite><Button onClick={() => setPaymentOpen(true)} disabled={summary.revenue.outstandingUsd <= 0}>
            <BanknoteArrowDown className="h-4 w-4" />
            登记美元收款
          </Button></BusinessWrite>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>自有货物收入</span>
                <ArrowDownLeft className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatAmount('USD', summary.revenue.ownedRevenueUsd)}</p>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>已收 {formatAmount('USD', summary.revenue.receivedUsd)}</span>
                <span>待收 {formatAmount('USD', summary.revenue.outstandingUsd)}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>自有货物采购成本</span>
                <ReceiptText className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatAmount('CNY', summary.cost.purchaseCostCny)}</p>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>已付 {formatAmount('CNY', summary.cost.paidPurchaseCostCny)}</span>
                <span>待付 {formatAmount('CNY', summary.cost.outstandingPurchaseCostCny)}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>预计商品毛利</span>
                <TrendingUp className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatAmount('CNY', summary.profit.estimatedGrossProfitCny)}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>预计毛利率</span>
                <span className="font-medium text-foreground">{summary.profit.estimatedGrossMarginPct.toFixed(2)}%</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>本柜实际净现金流</span>
                <Landmark className="h-4 w-4" />
              </div>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${summary.cashFlow.netCashCny < 0 ? 'text-destructive' : ''}`}>
                {formatAmount('CNY', summary.cashFlow.netCashCny)}
              </p>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>预计退税 {formatAmount('CNY', summary.tax.estimatedRefundCny)}</span>
                <span>实退 {formatAmount('CNY', summary.tax.actualRefundedCny)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {summary.profit.scope}
          </div>

          {summary.issues.length > 0 && (
            <div className="space-y-2" aria-label="财务口径提示">
              {summary.issues.map((issue) => (
                <div key={`${issue.code}-${issue.message}`} className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm">
                  <SemanticBadge tone={issueTone(issue.severity)} className="mt-0.5 shrink-0">
                    {issue.severity === 'error' ? '阻塞' : issue.severity === 'warning' ? '复核' : '说明'}
                  </SemanticBadge>
                  <span className={issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <SemanticBadge tone={summary.marginReady ? 'success' : 'danger'}>
              商品毛利{summary.marginReady ? '可用' : '不可用'}
            </SemanticBadge>
            <SemanticBadge tone={summary.cashReady ? 'success' : 'danger'}>
              现金流{summary.cashReady ? '可用' : '不可用'}
            </SemanticBadge>
            {issueErrors.length > 0 && (
              <span className="text-xs text-destructive">请先处理 {issueErrors.length} 个阻塞项</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>关联采购付款</CardTitle>
            <CardDescription>同一采购合同按本柜实际采购成本占比，分摊已付款金额。</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.linkedPurchases.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无已关联的采购合同</p>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>采购合同 / 供应商</TableHead>
                        <TableHead className="text-right">本柜成本</TableHead>
                        <TableHead className="text-right">已付分摊</TableHead>
                        <TableHead className="text-right">待付</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.linkedPurchases.map((purchase) => (
                        <TableRow key={purchase.contractNo}>
                          <TableCell>
                            <div className="font-medium">{purchase.contractNo}</div>
                            <div className="text-xs text-muted-foreground">{purchase.supplierName || '未匹配供应商'}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatAmount('CNY', purchase.allocatedCostCny)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatAmount('CNY', purchase.allocatedPaidCny)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatAmount('CNY', purchase.outstandingCny)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {summary.linkedPurchases.map((purchase) => (
                    <div key={purchase.contractNo} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{purchase.contractNo}</p>
                          <p className="text-xs text-muted-foreground">{purchase.supplierName || '未匹配供应商'}</p>
                        </div>
                        <SemanticBadge tone={purchase.outstandingCny > 0 ? 'warning' : 'success'}>
                          {purchase.outstandingCny > 0 ? '待付' : '已付清'}
                        </SemanticBadge>
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-muted-foreground">本柜成本</dt><dd className="mt-1 tabular-nums">{formatAmount('CNY', purchase.allocatedCostCny)}</dd></div>
                        <div><dt className="text-muted-foreground">已付</dt><dd className="mt-1 tabular-nums">{formatAmount('CNY', purchase.allocatedPaidCny)}</dd></div>
                        <div><dt className="text-muted-foreground">待付</dt><dd className="mt-1 tabular-nums">{formatAmount('CNY', purchase.outstandingCny)}</dd></div>
                      </dl>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>美元收款流水</CardTitle>
            <CardDescription>
              {summary.revenue.receivedSource === 'legacy_contract_balance'
                ? '历史合同余额，仅作过渡展示。'
                : '逐笔 USD 收款；第三方拼柜按自有收入比例排除。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary.receipts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无逐笔美元收款</p>
            ) : (
              <div className="space-y-3">
                {summary.receipts.map((receipt) => (
                  <div key={receipt.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{receipt.note || '出口货款'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(receipt.paymentDate)}{receipt.paymentMethod ? ` · ${receipt.paymentMethod}` : ''}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums text-emerald-600">+{formatAmount('USD', receipt.amountUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        type={PaymentType.RECEIVABLE}
        contractId={salesContractId}
        contractNo={contractNo}
        remainingAmount={summary.revenue.outstandingUsd}
        currency="USD"
        onSubmit={handleReceipt}
      />

      {loading && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在刷新财务口径
        </div>
      )}
    </div>
  );
}
