import { redirect } from "next/navigation";
import { withQuery, type RedirectSearchParams } from "@/lib/redirect-query";

/**
 * Input: 旧公开入口的查询参数
 * Output: 重定向到业务内退税模块（/dashboard/customs），保留查询参数
 * Pos: 兼容旧公开入口，统一退税路由结构
 */
export default async function TaxRefundsPage({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(withQuery("/dashboard/customs", await searchParams));
}
