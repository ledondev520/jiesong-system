/**
 * Input: 旧入口的查询参数（inventoryKeyword、inventoryPage 等）
 * Output: 重定向到库存页，保留查询参数
 * Pos: 旧 `/dashboard/inventory-status` 兼容入口（重定向 stub）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { redirect } from "next/navigation";
import { withQuery, type RedirectSearchParams } from "@/lib/redirect-query";

export default async function InventoryStatusPage({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(withQuery("/dashboard/inventory", await searchParams));
}
