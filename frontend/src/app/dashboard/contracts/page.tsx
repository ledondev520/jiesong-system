/**
 * Input: 无
 * Output: 重定向到采购列表页
 * Pos: 旧 `/dashboard/contracts` 兼容入口（重定向 stub）
 */
import { redirect } from 'next/navigation';

export default function ContractsPage() {
  redirect('/dashboard/purchases');
}
