/**
 * Input: 无
 * Output: 重定向到采购模块库存状态页
 * Pos: 仓储物流旧入口兼容路由，避免旧链接 404
 */

import { redirect } from "next/navigation";

export default function LogisticsPage() {
  redirect("/dashboard/inventory");
}
