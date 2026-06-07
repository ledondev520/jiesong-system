/**
 * Input: 旧合同模板上传路由
 * Output: 回到采购合同页
 * Pos: 兼容旧链接；合同模板上传在采购合同页内部弹窗完成
 */

import { redirect } from 'next/navigation';

export default function ContractTemplateUploadPage() {
  redirect('/dashboard/contracts');
}
