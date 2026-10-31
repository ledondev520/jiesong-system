/**
 * Input: 无
 * Output: 重定向到采购列表页
 * Pos: 旧 `/dashboard/purchase` 兼容入口（重定向 stub）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { redirect } from 'next/navigation';

export default function PurchasePage() {
  redirect('/dashboard/purchases');
}
