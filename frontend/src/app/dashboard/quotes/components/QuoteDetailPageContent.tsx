/**
 * Input: quote id, quote service, signed-in role
 * Output: quote detail — DRAFT shows the editor; other states show header facts and the product × store lines.
 *         One primary button per status (标记已发送 / 客户已接受 / 转为出口订单 / 查看订单), plus 导出 Excel, 打印, 复制为新报价.
 * Pos: /dashboard/quotes/[id]. Writes are shown to ADMIN/SALES only (backend enforces the same); BOSS has no export (denied server-side).
 * Owner decisions 2026-10-31: conversion sets the order FX to spot − 0.2 (server side); manual unit price accepts any value >= 0.
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types";
import { quoteService, type Quote } from "@/services/quote.service";
import {
  formatUsd,
  primaryActionFor,
  secondaryTransitionsFor,
  type QuoteStatus,
} from "@/lib/quote";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { PageHeader } from "@/components/layout/PageHeader";
import { QuoteEditor } from "./QuoteEditor";
import { QuoteStatusBadge } from "./QuoteStatusBadge";

const WRITE_ROLES: Role[] = [Role.ADMIN, Role.SALES];
const EXPORT_ROLES: Role[] = [
  Role.ADMIN,
  Role.SALES,
  Role.PURCHASE,
  Role.FINANCE,
];
const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function QuoteDetailPageContent({ id }: { id: string }) {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const canWrite = !!role && WRITE_ROLES.includes(role);
  const canExport = !!role && EXPORT_ROLES.includes(role);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    to: QuoteStatus;
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setQuote((await quoteService.getById(id)).data);
    } catch (error) {
      toast.error(message(error, "加载报价失败"));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (task: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast.error(message(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  const transition = (to: QuoteStatus) =>
    run(async () => {
      const response = await quoteService.transition(id, to);
      setQuote(response.data);
      if (to === "CONVERTED" && response.data.convertedOrder) {
        toast.success(
          `已转为出口订单 ${response.data.convertedOrder.contractNo}`,
        );
        router.push(`/dashboard/orders/${response.data.convertedOrder.id}`);
      } else {
        toast.success("状态已更新");
      }
    }, "状态更新失败");

  if (loading)
    return (
      <div className="py-12 text-center text-muted-foreground">加载中...</div>
    );
  if (!quote)
    return (
      <div className="py-12 text-center text-muted-foreground">
        报价不存在或无权查看。
      </div>
    );

  const primary = primaryActionFor(quote.status);
  const secondary = secondaryTransitionsFor(quote.status);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={quote.quoteNo}
        description={`${quote.customer?.name ?? "未选择客户"} · ${quote.incoterm}${quote.portOfLoading ? ` ${quote.portOfLoading}` : ""} · ${quote.currency}`}
        backHref="/dashboard/quotes"
        actions={
          <>
            <QuoteStatusBadge status={quote.status} expired={quote.isExpired} />
            {canExport && (
              <>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() =>
                    run(
                      () =>
                        quoteService.downloadXlsx(id, `${quote.quoteNo}.xlsx`),
                      "导出失败",
                    )
                  }
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  导出 Excel
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() =>
                    run(
                      () => quoteService.openPrintView(id),
                      "打印视图加载失败",
                    )
                  }
                >
                  <Printer className="mr-2 h-4 w-4" />
                  打印
                </Button>
              </>
            )}
            {canWrite && (
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const copy = await quoteService.create({
                      copyFromQuoteId: id,
                    });
                    toast.success(`已复制为 ${copy.data.quoteNo}`);
                    router.push(`/dashboard/quotes/${copy.data.id}`);
                  }, "复制失败")
                }
              >
                <Copy className="mr-2 h-4 w-4" />
                复制为新报价
              </Button>
            )}
          </>
        }
      />

      {quote.status === "DRAFT" && canWrite ? (
        <QuoteEditor
          quote={quote}
          onSaved={async (saved, { markSent }) => {
            setQuote(saved);
            if (markSent) await transition("SENT");
            else toast.success("报价已保存");
          }}
        />
      ) : (
        <>
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">报价信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="金额" value={formatUsd(quote.totalAmount)} />
              <Fact
                label="现汇 / 报价汇率"
                value={
                  quote.spotRate
                    ? `${quote.spotRate} / ${quote.pricingRate ?? "-"}`
                    : "-"
                }
              />
              <Fact
                label="有效期"
                value={quote.validUntil?.slice(0, 10) ?? "-"}
              />
              <Fact label="付款条件" value={quote.paymentTerms ?? "-"} />
              <Fact label="备注" value={quote.note ?? "-"} />
            </CardContent>
          </Card>
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-base">商品 × 门店</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">参考成本 ¥</TableHead>
                    <TableHead className="text-right">单价</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(quote.items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.product?.customsName ?? item.productId}
                      </TableCell>
                      <TableCell>
                        {item.store?.code || item.store?.name || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity} {item.unit ?? ""}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.costCny === null ? (
                          <SemanticBadge tone="warning">缺成本</SemanticBadge>
                        ) : (
                          item.costCny
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatUsd(item.unitPrice)}{" "}
                        {item.isManualPrice && (
                          <SemanticBadge tone="info">手动价</SemanticBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatUsd(item.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {(primary || secondary.length > 0) && quote.status !== "DRAFT" && (
        <div className="flex flex-wrap justify-end gap-3">
          {canWrite &&
            secondary.map((action) => (
              <Button
                key={action.to}
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action.to === "CANCELLED" || action.to === "REJECTED"
                    ? setConfirm(action)
                    : transition(action.to)
                }
              >
                {action.label}
              </Button>
            ))}
          {primary?.kind === "transition" && canWrite && (
            <Button disabled={busy} onClick={() => transition(primary.to)}>
              {primary.label}
            </Button>
          )}
          {primary?.kind === "viewOrder" && quote.salesContract && (
            <Button asChild>
              <Link href={`/dashboard/orders/${quote.salesContract.id}`}>
                {primary.label}
              </Link>
            </Button>
          )}
        </div>
      )}
      {quote.status === "DRAFT" && canWrite && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm({ to: "CANCELLED", label: "作废" })}
          >
            作废
          </Button>
        </div>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label}这张报价？</AlertDialogTitle>
            <AlertDialogDescription>
              报价不会被删除，状态将变为终态，之后不能再修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const to = confirm!.to;
                setConfirm(null);
                void transition(to);
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
