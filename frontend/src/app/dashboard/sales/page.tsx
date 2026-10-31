/**
 * Input: 旧出口订单列表 URL 及其查询参数（q/keyword、status、shipped、shippedFrom/To、storeId、page、pageSize）
 * Output: 服务端重定向到 /dashboard/orders，保留查询参数（keyword → q）
 * Pos: 旧 URL 重定向桩（UX 规范 §3.4）；订单详情/新建仍在 /dashboard/sales/[id] 与 /create，直到 J18/J19 迁移
 */
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export function ordersRedirectTarget(params: SearchParams = {}): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") continue;
    query.set(key === "keyword" ? "q" : key, value);
  }
  const text = query.toString();
  return text ? `/dashboard/orders?${text}` : "/dashboard/orders";
}

export default async function SalesListRedirect({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  redirect(ordersRedirectTarget(await searchParams));
}
