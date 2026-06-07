/**
 * Input: 路由请求
 * Output: 跳转到财务总览报表分析锚点
 * Pos: 旧财务报表路由兼容层
 *
 * Note: 财务顶层 Tab 只保留财务总览、收付管理；报表详情并入财务总览页。
 */

import { redirect } from 'next/navigation';

export default function FinancialStatementsPage() {
  redirect('/dashboard/finance#financial-statements');
}
