/**
 * Input: 一笔待分配收款，当前所有未收齐的销售合同列表
 * Output: 窄屏可换行分配操作、将收款金额按用户指定比例分配到多张合同
 * Pos: 财务收款流程第二步 - 把到账款分配到具体合同
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { financeService } from '@/services/finance.service';
import { loadPaginatedCatalog } from '@/services/paginatedCatalog';
import { clearApiGetCache } from '@/lib/axios';
import { Payment } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

interface AllocationRow {
  contractId: string;
  contractNo: string;
  unreceiveAmount: number;
  amount: string;
  selected: boolean;
}

interface AllocateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
  onSubmit: (paymentId: string, allocations: { salesContractId: string; amount: number }[]) => Promise<void>;
}

/**
 * 职责：让用户将一笔到账款分配到多张销售合同
 * 思路：
 *   1. 展示到账总额和已分配额
 *   2. 列出所有待收合同，用户选择并填写分配金额
 *   3. 校验总分配额不超过到账总额
 *   4. 提交分配
 */
export function AllocateDialog({ open, onOpenChange, payment, onSubmit }: AllocateDialogProps) {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !payment) return;
    let cancelled = false;
    setLoading(true); setLoadError(false); setRows([]);
    void loadPaginatedCatalog((page) => financeService.getReceivables({ page, pageSize: 100, outstandingOnly: true }))
      .then((contracts) => {
        if (!cancelled) setRows(contracts.map((contract) => ({
          contractId: contract.id, contractNo: contract.contractNo,
          unreceiveAmount: contract.unreceiveAmount ?? Math.max(0, contract.totalAmount - (contract.receivedAmount || 0)),
          amount: '', selected: false,
        })));
      }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, payment?.id, retry]);

  const totalAmount = payment?.remainingAmount ?? payment?.amount ?? 0;
  const currency = payment?.currency ?? 'USD';

  // 已分配合计
  const allocatedTotal = useMemo(() => {
    return rows
      .filter((r) => r.selected)
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  }, [rows]);

  const remaining = totalAmount - allocatedTotal;
  const isOverAllocated = allocatedTotal > totalAmount + 0.001;
  const hasSelection = rows.some((r) => r.selected && parseFloat(r.amount) > 0);

  const toggleRow = (contractId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.contractId === contractId ? { ...r, selected: !r.selected } : r))
    );
  };

  const updateAmount = (contractId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.contractId === contractId ? { ...r, amount: value } : r))
    );
  };

  // 快速填充：用剩余金额填满当前合同
  const autoFill = (contractId: string) => {
    const row = rows.find((r) => r.contractId === contractId);
    if (!row) return;
    const maxAmount = Math.min(remaining, row.unreceiveAmount);
    setRows((prev) =>
      prev.map((r) =>
        r.contractId === contractId
          ? { ...r, amount: maxAmount.toFixed(2), selected: true }
          : r
      )
    );
  };

  const handleSubmit = async () => {
    if (!payment || isOverAllocated || !hasSelection) return;
    setSubmitting(true);
    try {
      const allocations = rows
        .filter((r) => r.selected && parseFloat(r.amount) > 0)
        .map((r) => ({ salesContractId: r.contractId, amount: parseFloat(r.amount) }));
      await onSubmit(payment.id, allocations);
    } finally {
      setSubmitting(false);
    }
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>分配收款</DialogTitle>
          <DialogDescription>
            {payment.customerName ? `${payment.customerName} · ` : ''}
            到账 <span className="font-semibold text-foreground">{currency} {totalAmount.toLocaleString()}</span>
            {payment.note && ` · ${payment.note}`}
          </DialogDescription>
        </DialogHeader>

        {/* 分配进度条 */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">已分配</span>
            <span className={isOverAllocated ? 'text-destructive font-semibold' : 'font-semibold'}>
              {currency} {allocatedTotal.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">剩余可分配</span>
            <span className={remaining < 0 ? 'text-destructive' : 'text-primary font-semibold'}>
              {currency} {remaining.toFixed(2)}
            </span>
          </div>
          {isOverAllocated && (
            <div className="flex items-center gap-1 text-destructive text-xs mt-1">
              <AlertCircle className="h-3 w-3" />
              分配金额超出到账总额
            </div>
          )}
        </div>

        {/* 合同列表 */}
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2 pr-2">
            {loading ? <p role="status">加载待收合同...</p> : loadError ? <p className="text-sm text-destructive">待收合同读取失败 <Button variant="outline" onClick={() => { clearApiGetCache(); setRetry(retry + 1); }}>重试</Button></p> : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无待收合同</p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.contractId}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
                    row.selected ? 'border-primary/50 bg-primary/5' : 'bg-background'
                  }`}
                >
                  <Checkbox
                    id={`alloc-${row.contractId}`}
                    checked={row.selected}
                    onCheckedChange={() => toggleRow(row.contractId)}
                  />
                  <div className="min-w-0 flex-1 basis-32">
                    <Label htmlFor={`alloc-${row.contractId}`} className="font-medium text-sm cursor-pointer">
                      {row.contractNo}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      待收 {currency} {row.unreceiveAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="0.00"
                      className="h-8 w-24 text-right text-sm"
                      value={row.amount}
                      disabled={!row.selected}
                      onChange={(e) => updateAmount(row.contractId, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-primary"
                      onClick={() => autoFill(row.contractId)}
                      title="自动填入剩余可分配金额"
                    >
                      自动
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasSelection || isOverAllocated || submitting}
          >
            {submitting ? '分配中...' : `确认分配 ${currency} ${allocatedTotal.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
