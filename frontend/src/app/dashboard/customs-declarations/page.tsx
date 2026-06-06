/**
 * Input: 路由请求
 * Output: 重定向到出口退税
 * Pos: 报关单路由已合并到出口退税
 *
 * Note: 报关单功能已整合至出口退税模块，不再单独展示。
 */

import { redirect } from 'next/navigation';

export default function CustomsDeclarationsPage() {
  redirect('/dashboard/tax-refunds');
}
