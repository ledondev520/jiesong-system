/**
 * Input: 出口订单服务、列表 URL 状态（q/status/shipped/shippedFrom/shippedTo/storeId/page/pageSize，沿用旧 /sales 参数名）
 * Output: 出口订单表格（服务端分页、状态 chip、关键词），行点击进入订单详情
 * Pos: 业务 > 出口订单；旧 /dashboard/sales 列表重定向到这里。详情/新建仍在 /dashboard/sales/*，随 J18/J19 迁到 /orders/*
 */
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { formatMoney } from "@/lib/format";
import { listUrlFields, useListUrlState } from "@/lib/hooks/useListUrlState";
import { salesService } from "@/services/sales.service";
import { SalesStatus, type SalesContract } from "@/types";

const STATUS_FILTERS: { status: SalesStatus; label: string }[] = [
  { status: SalesStatus.DRAFT, label: "草稿" },
  { status: SalesStatus.CONFIRMED, label: "已确认" },
  { status: SalesStatus.PACKING, label: "装箱中" },
  { status: SalesStatus.SHIPPED, label: "已发运" },
  { status: SalesStatus.ARRIVED, label: "已到达" },
  { status: SalesStatus.COMPLETED, label: "已完成" },
];

const dateText = (value?: string) => (value ? value.slice(0, 10) : "—");

function OrdersList() {
  const router = useRouter();
  const [filters, setFilters] = useListUrlState(listUrlFields.orders);
  const [items, setItems] = useState<SalesContract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await salesService.getAll?.({
        page: filters.page,
        pageSize: filters.pageSize,
        keyword: filters.keyword || undefined,
        status: (filters.status as SalesStatus) || undefined,
        shipped: filters.shipped === "true" ? true : undefined,
        shippedFrom: filters.shippedFrom || undefined,
        shippedTo: filters.shippedTo || undefined,
        storeId: filters.storeId || undefined,
        lite: true,
      });
      setItems(response?.data.items ?? []);
      setTotal(response?.data.pagination.total ?? 0);
      setLoadError(null);
    } catch (error) {
      setLoadError(error ?? new Error("加载失败"));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<SalesContract>[] = [
    {
      key: "contractNo",
      header: "订单号",
      cell: (order) => (
        <Link href={`/dashboard/sales/${order.id}`} className="font-medium hover:underline">
          {order.contractNo}
        </Link>
      ),
      sortValue: (order) => order.contractNo,
      hideable: false,
    },
    { key: "stores", header: "门店", cell: (order) => (order.stores?.length ? order.stores.join("、") : "—") },
    { key: "port", header: "目的港", cell: (order) => order.port?.name ?? "—" },
    { key: "status", header: "状态", cell: (order) => <StatusBadge status={order.status} />, hideable: false },
    {
      key: "totalAmount",
      header: "金额 (USD)",
      cell: (order) => <AmountText>{formatMoney(order.totalAmount, "USD")}</AmountText>,
      sortValue: (order) => order.totalAmount,
      className: "text-right",
    },
    {
      key: "receivedAmount",
      header: "已收 (USD)",
      cell: (order) => <AmountText>{formatMoney(order.receivedAmount, "USD")}</AmountText>,
      sortValue: (order) => order.receivedAmount,
      className: "text-right",
      defaultHidden: true,
    },
    { key: "createdAt", header: "创建日期", cell: (order) => dateText(order.createdAt), sortValue: (order) => order.createdAt },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="出口订单"
        description="一张订单 = 客户 + 多个门店；点击订单号进入详情"
        actions={
          <BusinessWrite>
            <Button className="h-10 rounded-xl" onClick={() => router.push("/dashboard/orders/new")}>
              <Plus className="mr-2 h-4 w-4" /> 新建订单
            </Button>
          </BusinessWrite>
        }
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={items}
          rowKey={(order) => order.id}
          loading={loading}
          error={loadError}
          errorWhat="加载订单失败"
          onRetry={() => void load()}
          emptyTitle={filters.keyword || filters.status ? "没有符合条件的订单" : "暂无订单"}
          emptyDescription={filters.keyword || filters.status ? undefined : "点击右上角「新建订单」开始"}
          onRowClick={(order) => router.push(`/dashboard/sales/${order.id}`)}
          search={{
            value: filters.keyword,
            onChange: (keyword) => setFilters({ keyword }),
            placeholder: "搜索订单号、港口或门店...",
          }}
          filters={STATUS_FILTERS.map(({ status, label }) => ({
            key: status,
            label,
            active: filters.status === status,
            onToggle: () => setFilters({ status: filters.status === status ? "" : status }),
          }))}
          pagination={{
            page: filters.page,
            pageSize: filters.pageSize,
            total,
            onPageChange: (page) => setFilters({ page }),
            onPageSizeChange: (pageSize) => setFilters({ pageSize }),
          }}
        />
      </div>

      <div className="grid gap-3 md:hidden">
        {items.map((order) => (
          <Link key={order.id} href={`/dashboard/sales/${order.id}`}>
            <Card className="border-border/70">
              <CardContent className="space-y-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{order.contractNo}</p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {order.stores?.length ? order.stores.join("、") : "—"} · {order.port?.name ?? "—"}
                </p>
                <AmountText>{formatMoney(order.totalAmount, "USD")}</AmountText>
              </CardContent>
            </Card>
          </Link>
        ))}
        {!loading && !loadError && items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无订单</p>
        ) : null}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <OrdersList />
    </Suspense>
  );
}
