/**
 * Input: 旧入口的查询参数（inventoryKeyword、inventoryPage 等）
 * Output: 重定向到库存页，保留查询参数
 * Pos: 旧 `/dashboard/inventory-status` 兼容入口（重定向 stub）
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
