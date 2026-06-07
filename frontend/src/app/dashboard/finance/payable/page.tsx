/**
 * Input: 旧应付账款路由请求
 * Output: 重定向到收付管理应付视图
 * Pos: 财务模块旧独立页兼容入口，避免财务顶层 Tab 重新膨胀
 *
 * Note: 财务顶层 Interface 只保留概览、报表、收付管理。
 */

import { redirect } from 'next/navigation';

export default function PayablePage() {
  redirect('/dashboard/payments?tab=payable');
}
