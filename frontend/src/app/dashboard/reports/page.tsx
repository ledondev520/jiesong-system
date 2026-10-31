/**
 * Input: 旧经营执行 URL 及其查询参数（startDate、endDate、source 等）
 * Output: 服务端重定向到 /dashboard/finance/analysis（经营分析），保留全部查询参数
 * Pos: 旧 URL 重定向桩（UX 规范 §3.4）；页面本体在 finance/analysis
 */
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export function analysisRedirectTarget(params: SearchParams = {}): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const text = query.toString();
  return text
    ? `/dashboard/finance/analysis?${text}`
    : "/dashboard/finance/analysis";
}

export default async function ReportsRedirect({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  redirect(analysisRedirectTarget(await searchParams));
}
