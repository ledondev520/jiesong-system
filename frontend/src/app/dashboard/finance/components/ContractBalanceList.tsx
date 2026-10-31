/**
 * Input: 方向（应付/应收）、financeService 列表与统计、登记付款/收款的 PaymentDialog
 * Output: 财务页签「应付」「应收」共用的合同余额表：搜索、仅看未结清、逾期筛选、服务端分页、行内登记
 * Pos: /dashboard/finance/payable 与 /receivable；应付口径只来自后端 payablesService（草稿/已取消不计），本组件不重算金额
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { describeFailure } from "@/lib/error-reason";
import { formatMoney } from "@/lib/format";
import { financeService } from "@/services/finance.service";
import { PaymentType } from "@/types";
import { PaymentDialog, type PaymentSubmitData } from "./PaymentDialog";

export interface BalanceRow {
  id: string;
  contractNo: string;
  status: string;
  totalAmount: number;
  paidAmount?: number;
  unpaidAmount?: number;
  receivedAmount?: number;
  unreceiveAmount?: number;
  supplier?: { id: string; name: string };
  stores?: string[];
}

const KIND = {
  payable: {
    title: "应付",
    description: "已生效采购合同的未付余额（草稿和已取消的合同不是应付）",
    currency: "CNY" as const,
    detailHref: (id: string) => `/dashboard/purchase/${id}`,
    party: (row: BalanceRow) => row.supplier?.name ?? "—",
    partyLabel: "供应商",
    paid: (row: BalanceRow) => row.paidAmount ?? 0,
    open: (row: BalanceRow) => row.unpaidAmount ?? 0,
    paidLabel: "已付",
    openLabel: "未付",
    action: "登记付款",
    pastLabel: "已过交期",
  },
  receivable: {
    title: "应收",
    description: "出口订单的未收余额",
    currency: "USD" as const,
    detailHref: (id: string) => `/dashboard/sales/${id}`,
    party: (row: BalanceRow) => (row.stores?.length ? row.stores.join("、") : "—"),
    partyLabel: "门店",
    paid: (row: BalanceRow) => row.receivedAmount ?? 0,
    open: (row: BalanceRow) => row.unreceiveAmount ?? 0,
    paidLabel: "已收",
    openLabel: "未收",
    action: "登记收款",
    pastLabel: "已逾期",
  },
};

export function ContractBalanceList({ kind, refreshKey = 0 }: { kind: keyof typeof KIND; refreshKey?: number }) {
  const config = KIND[kind];
  // 旧 /dashboard/payments 链接带 overdue / pastDelivery：重定向后仍落在对应筛选上
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(true);
  const [flagged, setFlagged] = useState(params?.get(kind === "payable" ? "pastDelivery" : "overdue") === "true");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [openTotal, setOpenTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selected, setSelected] = useState<BalanceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = {
        page, pageSize, search: search.trim() || undefined, outstandingOnly: outstandingOnly || undefined,
        ...(kind === "payable" ? { pastDelivery: flagged || undefined } : { overdue: flagged || undefined }),
      };
      const [list, stats] = await Promise.all([
        kind === "payable" ? financeService.getPayables(query) : financeService.getReceivables(query),
        financeService.getStats(),
      ]);
      setRows(list.data.items as BalanceRow[]);
      setTotal(list.data.pagination.total);
      // 顶部合计直接取后端统计（与财务概览同源），不在前端求和
      setOpenTotal(kind === "payable" ? stats.payable.unpaid : stats.receivable.unreceived);
      setLoadError(null);
    } catch (error) {
      setLoadError(error ?? new Error("加载失败"));
    } finally {
      setLoading(false);
    }
  }, [kind, page, pageSize, search, outstandingOnly, flagged, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (data: PaymentSubmitData) => {
    if (!selected) throw new Error("请选择合同后重试");
    await financeService.createPayment({
      type: kind === "payable" ? PaymentType.PAYABLE : PaymentType.RECEIVABLE,
      ...(kind === "payable" ? { purchaseContractId: selected.id } : { salesContractId: selected.id }),
      amount: Number(data.amount),
      currency: config.currency,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate.toISOString(),
      note: data.note,
    });
    toast.success(kind === "payable" ? "付款记录已保存" : "收款记录已保存");
    setSelected(null);
    await load().catch((error) => toast.error(describeFailure("刷新失败", error)));
  };

  const columns: DataTableColumn<BalanceRow>[] = [
    {
      key: "contractNo",
      header: "合同号",
      cell: (row) => <Link href={config.detailHref(row.id)} className="font-medium hover:underline">{row.contractNo}</Link>,
      hideable: false,
    },
    { key: "party", header: config.partyLabel, cell: (row) => config.party(row) },
    { key: "status", header: "状态", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "total", header: "合同金额", cell: (row) => formatMoney(row.totalAmount, config.currency), className: "text-right" },
    { key: "paid", header: config.paidLabel, cell: (row) => formatMoney(config.paid(row), config.currency), className: "text-right" },
    { key: "open", header: config.openLabel, cell: (row) => <strong>{formatMoney(config.open(row), config.currency)}</strong>, className: "text-right" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={config.title} description={config.description} showBack={false} />
      <Card>
        <CardContent className="flex items-baseline justify-between p-4">
          <span className="text-sm text-muted-foreground">{config.openLabel}合计（全部合同，与财务概览同一口径）</span>
          <span className="text-2xl font-semibold tabular-nums" data-testid="open-total">
            {openTotal === null ? "—" : formatMoney(openTotal, config.currency)}
          </span>
        </CardContent>
      </Card>
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={loadError}
        errorWhat={`加载${config.title}失败`}
        onRetry={() => void load()}
        emptyTitle={search ? `没有符合条件的${config.title}` : `暂无${config.title}`}
        search={{ value: search, onChange: (value) => { setSearch(value); setPage(1); }, placeholder: "搜索合同号或对方名称..." }}
        filters={[
          { key: "outstanding", label: `仅看${config.openLabel}`, active: outstandingOnly, onToggle: () => { setOutstandingOnly(!outstandingOnly); setPage(1); } },
          { key: "flagged", label: config.pastLabel, active: flagged, onToggle: () => { setFlagged(!flagged); setPage(1); } },
        ]}
        pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
        renderActions={(row) => (config.open(row) > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setSelected(row)}>{config.action}</Button>
        ) : null)}
      />
      {selected ? (
        <PaymentDialog
          open
          onOpenChange={(open) => !open && setSelected(null)}
          type={kind === "payable" ? PaymentType.PAYABLE : PaymentType.RECEIVABLE}
          contractNo={selected.contractNo}
          contractId={selected.id}
          remainingAmount={config.open(selected)}
          currency={config.currency}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
