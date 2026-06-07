/**
 * Input: 无
 * Output: 重定向到出口退税页的报关单工作区
 * Pos: 报关单旧列表入口兼容路由
 */

import { redirect } from 'next/navigation';

export default function CustomsDeclarationsPage() {
  redirect('/dashboard/tax-refunds?view=customs');
}
