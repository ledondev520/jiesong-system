/**
 * Input: 出口订单服务、列表 URL 状态（q/status/shipped/shippedFrom/shippedTo/storeId/page/pageSize，沿用旧 /sales 参数名）
 * Output: 出口订单表格（服务端分页、发运阶段 chips 待装柜/装柜中/已发运/已到港带计数、发运日期与预计到港列、关键词、发运前利用率徽章），行点击进入订单详情
 * Pos: 业务 > 出口订单；旧 /dashboard/sales 列表重定向到这里。详情在 /dashboard/orders/[id]，新建在 /dashboard/orders/new
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
import { StageChips } from "@/components/ui/stage-chips";
import { SemanticBadge, StatusBadge } from "@/components/ui/status-badge";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { formatDate } from "@/lib/date-format";
import { formatMoney } from "@/lib/format";
import { listUrlFields, useListUrlState } from "@/lib/hooks/useListUrlState";
import { useLatestRequest } from "@/lib/hooks/useLatestRequest";
import { salesService } from "@/services/sales.service";
import { SalesStatus, type SalesContract } from "@/types";

// 发运阶段是状态预设，不是新页面（E1）；口径与工作台待办一致：CONFIRMED=待装柜，PACKING=装柜中（待发运），与订单状态徽章「装柜中」同名
const SHIPPING_STAGES: {
  status: SalesStatus | "";
  key: string;
  label: string;
}[] = [
  { status: "", key: "all", label: "全部" },
  {
    status: SalesStatus.CONFIRMED,
    key: SalesStatus.CONFIRMED,
    label: "待装柜",
  },
  { status: SalesStatus.PACKING, key: SalesStatus.PACKING, label: "装柜中" },
  { status: SalesStatus.SHIPPED, key: SalesStatus.SHIPPED, label: "已发运" },
  { status: SalesStatus.ARRIVED, key: SalesStatus.ARRIVED, label: "已到港" },
];

// 阶段 chip 已覆盖的状态不再重复出现在表格筛选里
const OTHER_STATUS_FILTERS: { status: SalesStatus; label: string }[] = [
  { status: SalesStatus.DRAFT, label: "草稿" },
  { status: SalesStatus.COMPLETED, label: "已完成" },
];

// 后端列表附带的 40HQ 汇总利用率（毛重或体积任一 ≥ 阈值）；能否装得下以详情页排柜为准
type OrderRow = SalesContract & {
  loadingUtilisation?: {
    thresholdPct: number;
    weightPct: number;
    volumePct: number;
    utilisationReady: boolean;
  };
};

const BEFORE_SHIPMENT: SalesStatus[] = [
  SalesStatus.DRAFT,
  SalesStatus.CONFIRMED,
  SalesStatus.PACKING,
];

const pctText = (pct: number) => (Math.floor(pct * 10) / 10).toFixed(1);

/** 职责：发运前订单的利用率徽章「利用率达标」/「未达80%」；不称「可出柜」 */
function UtilisationBadge({ order }: { order: OrderRow }) {
  const utilisation = order.loadingUtilisation;
  if (!utilisation || !BEFORE_SHIPMENT.includes(order.status)) return null;
  return utilisation.utilisationReady ? (
    <SemanticBadge tone="success">利用率达标</SemanticBadge>
  ) : (
    <SemanticBadge
      tone="warning"
      title={`毛重 ${pctText(utilisation.weightPct)}% / 体积 ${pctText(utilisation.volumePct)}%，任一 ≥ ${utilisation.thresholdPct}% 视为利用率达标；是否装得下以详情页排柜为准`}
    >
      未达{utilisation.thresholdPct}%
    </SemanticBadge>
  );
}

const dateText = (value?: string) => (value ? value.slice(0, 10) : "—");

function OrdersList() {
  const router = useRouter();
  const [filters, setFilters] = useListUrlState(listUrlFields.orders);
  // useListUrlState returns a fresh object every render; depend on its values or load() loops forever.
  const {
    page,
    pageSize,
    keyword,
    status,
    shipped,
    shippedFrom,
    shippedTo,
    storeId,
  } = filters;
  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const startRequest = useLatestRequest();
  // 阶段计数：每个阶段一次 pageSize=1 的只读列表请求取 pagination.total；失败显示「—」而不是 0
  const [stageCounts, setStageCounts] = useState<Record<string, number | null>>(
    {},
  );
  const [stageCountsLoading, setStageCountsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      SHIPPING_STAGES.map(async (stage) => {
        try {
          const response = await salesService.getAll?.({
            page: 1,
            pageSize: 1,
            status: stage.status || undefined,
            lite: true,
          });
          return [stage.key, response?.data.pagination.total ?? null] as const;
        } catch {
          return [stage.key, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setStageCounts(Object.fromEntries(entries));
      setStageCountsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    const isCurrent = startRequest();
    setLoading(true);
    try {
      const response = await salesService.getAll?.({
        page,
        pageSize,
        keyword: keyword || undefined,
        status: (status as SalesStatus) || undefined,
        shipped: shipped === "true" ? true : undefined,
        shippedFrom: shippedFrom || undefined,
        shippedTo: shippedTo || undefined,
        storeId: storeId || undefined,
        lite: true,
      });
      if (!isCurrent()) return;
      setItems(response?.data.items ?? []);
      setTotal(response?.data.pagination.total ?? 0);
      setLoadError(null);
    } catch (error) {
      if (isCurrent()) setLoadError(error ?? new Error("加载失败"));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [
    startRequest,
    page,
    pageSize,
    keyword,
    status,
    shipped,
    shippedFrom,
    shippedTo,
    storeId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: "contractNo",
      header: "订单号",
      cell: (order) => (
        <Link
          href={`/dashboard/orders/${order.id}`}
          className="font-medium hover:underline"
        >
          {order.contractNo}
        </Link>
      ),
      sortValue: (order) => order.contractNo,
      hideable: false,
    },
    {
      key: "customer",
      header: "客户",
      cell: (order) => order.customer?.name ?? "—",
      sortValue: (order) => order.customer?.name ?? "",
    },
    {
      key: "stores",
      header: "门店",
      cell: (order) => (order.stores?.length ? order.stores.join("、") : "—"),
    },
    { key: "port", header: "目的港", cell: (order) => order.port?.name ?? "—" },
    {
      key: "shippedAt",
      header: "发运日期",
      cell: (order) => formatDate(order.shippedAt, "—"),
      sortValue: (order) => order.shippedAt ?? "",
    },
    {
      key: "estimatedArrival",
      header: "预计到港",
      cell: (order) => formatDate(order.estimatedArrival, "—"),
      sortValue: (order) => order.estimatedArrival ?? "",
    },
    {
      key: "status",
      header: "状态",
      cell: (order) => <StatusBadge status={order.status} domain="salesOrder" />,
      hideable: false,
    },
    {
      key: "utilisation",
      header: "装柜利用率",
      cell: (order) => <UtilisationBadge order={order} />,
    },
    {
      key: "totalAmount",
      header: "金额 (USD)",
      cell: (order) => (
        <AmountText>{formatMoney(order.totalAmount, "USD")}</AmountText>
      ),
      sortValue: (order) => order.totalAmount,
      className: "text-right",
    },
    {
      key: "receivedAmount",
      header: "已收 (USD)",
      cell: (order) => (
        <AmountText>{formatMoney(order.receivedAmount, "USD")}</AmountText>
      ),
      sortValue: (order) => order.receivedAmount,
      className: "text-right",
      defaultHidden: true,
    },
    {
      key: "createdAt",
      header: "创建日期",
      cell: (order) => dateText(order.createdAt),
      sortValue: (order) => order.createdAt,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="出口订单"
        description="管理客户出口订单、装柜发运进度与单证归档"
        actions={
          <BusinessWrite>
            <Button
              className="h-10 rounded-xl"
              onClick={() => router.push("/dashboard/orders/new")}
            >
              <Plus className="mr-2 h-4 w-4" /> 新建出口订单
            </Button>
          </BusinessWrite>
        }
      />

      <StageChips
        ariaLabel="发运阶段"
        stages={SHIPPING_STAGES.map((stage) => ({
          key: stage.key,
          label: stage.label,
          count: stageCounts[stage.key],
        }))}
        // 草稿/已完成等不在阶段里的筛选：不高亮任何阶段，也不冒充「全部」
        value={
          SHIPPING_STAGES.find((stage) => stage.status === filters.status)
            ?.key ?? "other"
        }
        loading={stageCountsLoading}
        onChange={(key) =>
          setFilters({
            status:
              SHIPPING_STAGES.find((stage) => stage.key === key)?.status ?? "",
          })
        }
      />

      <DataTable
        renderCard={(order) => (
          <Link href={`/dashboard/orders/${order.id}`}>
            <Card className="border-border/70">
              <CardContent className="space-y-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{order.contractNo}</p>
                  <StatusBadge status={order.status} domain="salesOrder" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {order.stores?.length ? order.stores.join("、") : "—"} ·{" "}
                  {order.port?.name ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  发运 {formatDate(order.shippedAt, "—")} · 预计到港{" "}
                  {formatDate(order.estimatedArrival, "—")}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <AmountText>
                    {formatMoney(order.totalAmount, "USD")}
                  </AmountText>
                  <UtilisationBadge order={order} />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
        columns={columns}
        data={items}
        rowKey={(order) => order.id}
        loading={loading}
        error={loadError}
        errorWhat="加载订单失败"
        onRetry={() => void load()}
        emptyTitle={
          filters.keyword || filters.status ? "没有符合条件的订单" : "暂无订单"
        }
        emptyDescription={
          filters.keyword || filters.status
            ? undefined
            : "点击右上角「新建订单」开始"
        }
        onRowClick={(order) => router.push(`/dashboard/orders/${order.id}`)}
        search={{
          value: filters.keyword,
          onChange: (keyword) => setFilters({ keyword }),
          placeholder: "搜索订单号、港口或门店...",
        }}
        filters={OTHER_STATUS_FILTERS.map(({ status, label }) => ({
          key: status,
          label,
          active: filters.status === status,
          onToggle: () =>
            setFilters({ status: filters.status === status ? "" : status }),
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
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-muted-foreground">加载中...</div>
      }
    >
      <OrdersList />
    </Suspense>
  );
}
