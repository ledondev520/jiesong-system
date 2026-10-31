/**
 * Input: 无
 * Output: 重定向到 /dashboard/customs?view=customs（单证与退税页的报关单页签）
 * Pos: 报关单旧列表入口兼容路由
 */

import { redirect } from 'next/navigation';

export default function CustomsDeclarationsPage() {
  redirect('/dashboard/customs?view=customs');
}
