/**
 * Input: 财务账期与美元应收对账 Interface
 * Output: 正式合同、银行到账、会计应收和异常桥接卡片
 * Pos: 财务报表页的客户美元应收解释 Module
 */

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { financeService, type ReceivableReconciliation } from '@/services/finance.service';

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
}).format(value);

const formatCny = (value: number) => new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
}).format(value);

export function ReceivableReconciliationCard({ year, month }: { year: number; month: number }) {
  const [data, setData] = useState<ReceivableReconciliation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    financeService.getReceivableReconciliation(year, month)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, month]);

  if (loading) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">正在核对美元应收与会计应收…</CardContent></Card>;
  }
  if (!data) return null;

  const hasAnomaly = data.anomalies.duplicateDebitCny > 0 || data.anomalies.missingContracts.length > 0;

  return (
    <Card data-testid="receivable-reconciliation-card">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">客户美元应收对账</CardTitle>
          <Badge variant={hasAnomaly ? 'destructive' : 'secondary'}>
            {hasAnomaly ? <AlertTriangle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
            {hasAnomaly ? '发现会计分录差异' : '已对平'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          截至 {data.cutoffDate}；合同与银行按客户累计核销，会计金额按本期实际记账汇率桥接。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">正式EXP销售</p>
            <p className="mt-1 font-semibold tabular-nums">{formatUsd(data.formalSalesUsd)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">客户美元到账</p>
            <p className="mt-1 font-semibold tabular-nums">{formatUsd(data.receivedUsd)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">经营口径未收</p>
            <p className="mt-1 font-semibold tabular-nums">{formatUsd(data.operatingReceivableUsd)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">资产负债表应收</p>
            <p className="mt-1 font-semibold tabular-nums">{formatCny(data.reportedReceivableCny)}</p>
          </div>
        </div>

        {hasAnomaly && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">会计应收差异来源</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {data.anomalies.duplicateDebitCny > 0 && (
                <li>重复确认：{data.anomalies.duplicateContracts.join('、')}，多计 {formatCny(data.anomalies.duplicateDebitCny)}</li>
              )}
              {data.anomalies.missingContracts.map((contract) => (
                <li key={contract.contractNo}>
                  漏确认：{contract.contractNo} {formatUsd(contract.amountUsd)}，估算少计 {formatCny(contract.estimatedAmountCny || 0)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">修正后的会计应收</p>
            <p className="font-medium tabular-nums">{formatCny(data.correctedAccountingReceivableCny)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">经营应收折算</p>
            <p className="font-medium tabular-nums">{formatCny(data.translatedOperatingReceivableCny || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">剩余汇率/手续费差</p>
            <p className="font-medium tabular-nums">{formatCny(data.residualCny || 0)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
