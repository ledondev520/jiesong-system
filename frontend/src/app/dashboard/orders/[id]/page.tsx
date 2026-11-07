/**
 * Input: 路由参数 id
 * Output: 出口订单详情页（页签见 components/OrderDetailPage）
 * Pos: 业务 > 出口订单 > 详情；旧 /dashboard/sales/[id] 重定向到这里
 */
"use client";

import { Suspense, use } from "react";
import { OrderDetailPage } from "./components/OrderDetailPage";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <OrderDetailPage id={id} />
    </Suspense>
  );
}
