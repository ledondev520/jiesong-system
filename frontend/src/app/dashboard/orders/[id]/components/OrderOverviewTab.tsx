/**
 * Input: 出口订单详情、出柜判定结果
 * Output: 概览页签：金额汇总、装柜摘要、物流时间线、「按门店」履约表（下单 / 已采购 / 已入库 / 已装箱）
 * Pos: /dashboard/orders/[id] 概览（UX 规范 §4.2）
 */
"use client";

import { useMemo } from "react";
import {
  Anchor,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Store as StoreIcon,
  Truck,
} from "lucide-react";
import { SalesStatus, type SalesContract } from "@/types";
import { formatDate } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildStoreFulfilment, type OrderReadiness } from "./orderDetailModel";

const LOGISTICS_EVENTS = [
  { status: SalesStatus.DRAFT, label: "合同草稿", icon: CircleDashed },
  { status: SalesStatus.CONFIRMED, label: "合同确认", icon: CircleDot },
  { status: SalesStatus.PACKING, label: "装箱装柜", icon: Boxes },
  { status: SalesStatus.SHIPPED, label: "报关发运", icon: Truck },
  { status: SalesStatus.ARRIVED, label: "到港清关", icon: Anchor },
  { status: SalesStatus.COMPLETED, label: "收款完成", icon: CheckCircle2 },
];

const STATUS_ORDER: Record<SalesStatus, number> = {
  [SalesStatus.DRAFT]: 0,
  [SalesStatus.CONFIRMED]: 1,
  [SalesStatus.PACKING]: 2,
  [SalesStatus.SHIPPED]: 3,
  [SalesStatus.ARRIVED]: 4,
  [SalesStatus.COMPLETED]: 5,
  [SalesStatus.CANCELLED]: -1,
};

const usd = (value: number) => `$${(value || 0).toLocaleString()}`;

/** 职责：物流时间线（与原详情页同口径：箱数/体积取装箱明细合计） */
const buildTimeline = (contract: SalesContract, readiness: OrderReadiness) => {
  const currentStep = STATUS_ORDER[contract.status] ?? 0;
  const timeline: Array<{
    date?: string;
    label: string;
    description: string;
    completed: boolean;
  }> = [
    {
      date: contract.createdAt,
      label: "合同创建",
      description: `合同编号 ${contract.contractNo}`,
      completed: true,
    },
  ];
  if (contract.signedAt) {
    timeline.push({
      date: contract.signedAt,
      label: "合同签订",
      description: contract.port?.name
        ? `目的港：${contract.port.name}`
        : "合同已签订",
      completed: true,
    });
  }
  if (contract.packingItems && contract.packingItems.length > 0) {
    timeline.push({
      date: contract.updatedAt,
      label: "装箱完成",
      description: `${readiness.totals.cartons} 箱，${readiness.totals.cargoCbm.toFixed(2)} CBM`,
      completed: currentStep >= STATUS_ORDER[SalesStatus.PACKING],
    });
  }
  if (contract.shippedAt || currentStep >= STATUS_ORDER[SalesStatus.SHIPPED]) {
    timeline.push({
      date: contract.shippedAt || contract.updatedAt,
      label: "报关发运",
      description: contract.customsBroker
        ? `报关行：${contract.customsBroker}`
        : "已报关发运",
      completed: true,
    });
  }
  if (contract.estimatedArrival) {
    timeline.push({
      date: contract.estimatedArrival,
      label: "预计到港",
      description: contract.port?.name ? `目的港：${contract.port.name}` : "",
      completed: currentStep >= STATUS_ORDER[SalesStatus.ARRIVED],
    });
  }
  if (contract.payments && contract.payments.length > 0) {
    const lastPayment = contract.payments[contract.payments.length - 1];
    timeline.push({
      date: lastPayment.paymentDate,
      label: "收款记录",
      description: `${usd(contract.receivedAmount)} / ${usd(contract.totalAmount)}`,
      completed: (contract.receivedAmount || 0) >= (contract.totalAmount || 0),
    });
  }
  return timeline;
};

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export function OrderOverviewTab({
  contract,
  readiness,
}: {
  contract: SalesContract;
  readiness: OrderReadiness;
}) {
  const storeRows = useMemo(() => buildStoreFulfilment(contract), [contract]);
  const timeline = buildTimeline(contract, readiness);
  const currentStepIndex = STATUS_ORDER[contract.status] ?? 0;
  const total = contract.totalAmount || 0;
  const received = contract.receivedAmount || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric label="合同金额" value={usd(total)} />
        <Metric label="已收款" value={usd(received)}>
          {total > 0 && (
            <Progress
              value={Math.min((received / total) * 100, 100)}
              className="mt-2 h-1.5"
            />
          )}
        </Metric>
        <Metric label="未收款" value={usd(Math.max(total - received, 0))} />
        <Metric
          label={`${readiness.totals.cartons} 箱 · 毛重 ${readiness.totals.grossKg.toLocaleString()} kg（${readiness.plan?.containerType ?? "—"}）`}
          value={`${readiness.totals.cargoCbm.toFixed(2)} CBM`}
        >
          <p
            className={`mt-2 text-xs ${readiness.isBlocking ? "text-destructive" : "text-muted-foreground"}`}
          >
            {readiness.headline}
          </p>
        </Metric>
      </div>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <StoreIcon className="h-4 w-4 text-primary" />
            按门店
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {storeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无订单明细
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>门店</TableHead>
                    <TableHead className="text-right">下单</TableHead>
                    <TableHead className="text-right">已采购</TableHead>
                    <TableHead className="text-right">已入库</TableHead>
                    <TableHead className="text-right">已装箱</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeRows.map((row) => (
                    <TableRow key={row.storeId || "unassigned"}>
                      <TableCell className="font-medium">
                        {row.storeName}
                      </TableCell>
                      {[
                        row.ordered,
                        row.purchased,
                        row.received,
                        row.packed,
                      ].map((value, index) => (
                        <TableCell
                          key={index}
                          className="text-right tabular-nums"
                        >
                          {value.toLocaleString()}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            已采购只计未取消的采购单；已入库为验货合格数量。
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4 text-primary" />
            物流时间线
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 pt-0">
          <div className="mb-4 flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1">
            {LOGISTICS_EVENTS.map((event, idx) => {
              const EventIcon = event.icon;
              const isCompleted = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={event.status}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <div
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      isCompleted
                        ? isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <EventIcon className="h-3 w-3" />
                    {event.label}
                  </div>
                  {idx < LOGISTICS_EVENTS.length - 1 && (
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  )}
                </div>
              );
            })}
          </div>
          <div>
            {timeline.map((item, idx) => (
              <div key={idx} className="relative flex gap-4 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-2 w-2 rounded-full ${item.completed ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  {idx < timeline.length - 1 && (
                    <div className="mt-1 w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="-mt-1 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDate(item.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
