/**
 * Input: 旧出口合同详情 URL（/dashboard/sales/[id]?tab=…）
 * Output: 服务端重定向到 /dashboard/orders/[id]，保留查询参数（旧 tab 键由详情页映射）
 * Pos: 旧 URL 重定向桩（UX 规范 §3.4），书签与后端生成的链接继续可用
 */
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export function orderDetailRedirectTarget(
  id: string,
  params: SearchParams = {},
): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const text = query.toString();
  const path = `/dashboard/orders/${encodeURIComponent(id)}`;
  return text ? `${path}?${text}` : path;
}

export default async function SalesDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  redirect(orderDetailRedirectTarget(id, await searchParams));
}
