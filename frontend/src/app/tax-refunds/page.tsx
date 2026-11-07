import { redirect } from "next/navigation";
import { withQuery, type RedirectSearchParams } from "@/lib/redirect-query";

/**
 * Input: 旧公开入口的查询参数
 * Output: 重定向到业务内退税模块（/dashboard/customs），保留查询参数
 * Pos: 兼容旧公开入口，统一退税路由结构
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export default async function TaxRefundsPage({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(withQuery("/dashboard/customs", await searchParams));
}
