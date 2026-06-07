/**
 * Input: 旧合同模板管理路由
 * Output: 回到采购合同页
 * Pos: 兼容旧链接；合同模板作为采购合同页内部工具，不再作为独立页面
 */

import { redirect } from 'next/navigation';

export default function ContractTemplatesPage() {
  redirect('/dashboard/contracts');
}
