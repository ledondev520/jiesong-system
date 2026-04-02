import { redirect } from 'next/navigation';

/**
 * Input: 无
 * Output: 重定向到业务内退税模块
 * Pos: 兼容旧公开入口，统一退税路由结构
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export default function TaxRefundsPage() {
  redirect('/dashboard/tax-refunds');
}
