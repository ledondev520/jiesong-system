/**
 * Input: 无
 * Output: 重定向到收付款页（应收账款已合并进收付款管理）
 * Pos: 财务模块兼容重定向层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { redirect } from 'next/navigation';

export default function ReceivablePage() {
  redirect('/dashboard/payments');
}
