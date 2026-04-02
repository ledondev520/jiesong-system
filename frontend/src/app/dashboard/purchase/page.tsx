/**
 * Input: 无
 * Output: 重定向到采购合同列表页
 * Pos: 采购模块兼容入口，避免 `/dashboard/purchase` 404
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { redirect } from 'next/navigation';

export default function PurchasePage() {
  redirect('/dashboard/contracts');
}
