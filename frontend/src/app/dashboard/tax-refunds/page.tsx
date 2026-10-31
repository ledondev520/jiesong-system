/**
 * Input: 无
 * Output: 重定向到 /dashboard/customs（单证与退税页，默认退税工作台）
 * Pos: 旧 `/dashboard/tax-refunds` 列表入口兼容 stub；详情/新建/编辑路由保持原地址
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { redirect } from "next/navigation";

export default function TaxRefundsDashboardPage() {
  redirect("/dashboard/customs");
}
