/**
 * Input: 待分配收款（financeService）、ReceiptDialog / AllocateDialog
 * Output: 应收页顶部的「记录到账」「自动匹配」「待分配款项」池与分配弹窗；任何写入后回调 onChanged 让合同列表刷新
 * Pos: 从旧 /dashboard/payments 页拆出（J26）；文案和按钮名保持不变（分配、自动匹配、记录到账），真实收款池 E2E 依赖它们
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Split } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { invalidateCache } from "@/lib/api-cache";
import { buildReceiptNote } from "@/lib/finance-note";
import { financeService } from "@/services/finance.service";
import { PaymentType, type Payment } from "@/types";
import { AllocateDialog } from "./AllocateDialog";
import { ReceiptDialog, type ReceiptSubmitData } from "./ReceiptDialog";

// 待分配款项很多时只先展示前几笔，主表（合同未收余额）才是页面主体。
const PREVIEW_COUNT = 5;

/** 按币种分别合计剩余待分配金额（不同币种不相加）。 */
function unallocatedTotals(payments: Payment[]): string {
  const byCurrency = new Map<string, number>();
  for (const p of payments) {
    byCurrency.set(
      p.currency,
      (byCurrency.get(p.currency) ?? 0) + (p.remainingAmount ?? p.amount),
    );
  }
  return [...byCurrency]
    .map(([currency, sum]) => `${currency} ${sum.toLocaleString()}`)
    .join("、");
}

export function UnallocatedReceiptsPanel({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<Payment | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmAutoMatch, setConfirmAutoMatch] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await financeService.getUnallocatedPayments();
      setPayments(response.data || []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAll = () => {
    invalidateCache("fin-receivables");
    invalidateCache("fin-stats");
    void load();
    onChanged();
  };

  // 先记录到账（无合同，进入待分配池）
  const handleReceiptSubmit = async (data: ReceiptSubmitData) => {
    try {
      await financeService.createPayment({
        type: PaymentType.RECEIVABLE_RECEIPT,
        customerName: data.customerName,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note:
          buildReceiptNote({
            contractRef: data.contractRef,
            note: data.note,
          }) || undefined,
      });
      toast.success("到账记录已保存，请前往分配");
      setReceiptOpen(false);
      void load();
    } catch {
      toast.error("记录到账失败");
    }
  };

  const handleAllocateSubmit = async (
    paymentId: string,
    allocations: { salesContractId: string; amount: number }[],
  ) => {
    try {
      await financeService.allocatePayment(paymentId, allocations);
      toast.success(`已分配 ${allocations.length} 张合同`);
      setAllocateTarget(null);
      refreshAll();
    } catch {
      toast.error("分配失败，请重试");
    }
  };

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const result = (await financeService.autoMatchUnallocatedPayments()).data;
      if ((result?.matchedCount || 0) > 0) {
        toast.success(
          `自动匹配 ${result?.matchedCount} 笔，剩余 ${result?.skippedCount || 0} 笔待人工处理`,
        );
      } else {
        toast.message(
          `没有命中高置信度规则，${result?.skippedCount || 0} 笔继续留在收款池`,
        );
      }
      refreshAll();
    } catch {
      toast.error("自动匹配失败，请稍后重试");
    } finally {
      setAutoMatching(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <BusinessWrite>
          <Button
            size="sm"
            className="h-10"
            onClick={() => setReceiptOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> 记录到账
          </Button>
        </BusinessWrite>
      </div>

      {loadFailed ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          收款池读取失败{" "}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            重试
          </Button>
        </div>
      ) : null}

      {payments.length > 0 && (
        <Card className="border-status-amber/40 bg-status-amber-soft/50">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-status-amber">
              <Split className="h-4 w-4" />
              待分配款项（{payments.length} 笔）
            </CardTitle>
            <BusinessWrite>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-status-amber/40 bg-background text-xs text-status-amber hover:bg-status-amber-soft"
                onClick={() => setConfirmAutoMatch(true)}
                disabled={autoMatching}
              >
                <RefreshCw
                  className={`mr-1 h-3.5 w-3.5 ${autoMatching ? "animate-spin" : ""}`}
                />
                {autoMatching ? "自动匹配中" : "自动匹配"}
              </Button>
            </BusinessWrite>
          </CardHeader>
          <CardContent
            className={cn("space-y-2", expanded && "max-h-96 overflow-y-auto")}
          >
            {(expanded ? payments : payments.slice(0, PREVIEW_COUNT)).map(
              (p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-status-amber/40 bg-background px-3 py-2"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {p.customerName || "未标注客户"}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        剩余待分配 {p.currency}{" "}
                        {(p.remainingAmount ?? p.amount).toLocaleString()}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.paymentDate).toLocaleDateString("zh-CN")}
                      {p.note && ` · ${p.note}`}
                    </span>
                  </div>
                  <BusinessWrite>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setAllocateTarget(p)}
                    >
                      <Split className="mr-1 h-3 w-3" /> 分配
                    </Button>
                  </BusinessWrite>
                </div>
              ),
            )}
            {payments.length > PREVIEW_COUNT && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full text-xs text-status-amber"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? "收起"
                  : `显示全部 ${payments.length} 笔（当前显示前 ${PREVIEW_COUNT} 笔）`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmAutoMatch} onOpenChange={setConfirmAutoMatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认自动匹配？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>
                  范围：当前待分配的全部 {payments.length} 笔（
                  {unallocatedTotals(payments)}）。
                </p>
                <p>
                  规则：备注里含唯一的出口合同号，且到账金额与该合同待收金额完全一致，才会分配到该合同（对应合同未收余额随之减少、应收合计同步下降）；其余继续留在收款池。
                </p>
                <p>分配结果请在应收列表中逐笔核对。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleAutoMatch()}>
              开始自动匹配
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        onSubmit={handleReceiptSubmit}
      />
      <AllocateDialog
        open={!!allocateTarget}
        onOpenChange={(open) => !open && setAllocateTarget(null)}
        payment={allocateTarget}
        onSubmit={handleAllocateSubmit}
      />
    </>
  );
}
