/**
 * Input: 路由请求
 * Output: 重定向到财务概览
 * Pos: 财务报表路由已合并到财务概览
 *
 * Note: 财务报表功能已整合至财务概览模块，不再单独展示。
 */

import { redirect } from 'next/navigation';

export default function FinancialStatementsPage() {
  redirect('/dashboard/finance');
}
