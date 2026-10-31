/**
 * Input: 无
 * Output: 重定向到库存页
 * Pos: 旧 `/dashboard/inventory-status` 兼容入口（重定向 stub）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { redirect } from "next/navigation";

export default function InventoryStatusPage() {
  redirect("/dashboard/inventory");
}
