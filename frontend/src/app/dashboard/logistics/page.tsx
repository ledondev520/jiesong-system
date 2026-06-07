/**
 * Input: 无
 * Output: 重定向到采购模块库存状态页
 * Pos: 仓储物流旧入口兼容路由，避免旧链接 404
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { redirect } from 'next/navigation';

export default function LogisticsPage() {
  redirect('/dashboard/inventory-status');
}
