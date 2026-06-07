/**
 * Input: 无
 * Output: 重定向到出口合同页
 * Pos: 货柜装箱旧入口兼容路由，避免仓储物流作为顶层 Module 继续暴露
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { redirect } from 'next/navigation';

export default function ContainersPage() {
  redirect('/dashboard/sales');
}
