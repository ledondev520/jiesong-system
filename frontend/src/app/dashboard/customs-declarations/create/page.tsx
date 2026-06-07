/**
 * Input: customsDeclarationService、router、toast
 * Output: 新建报关单页面
 * Pos: 报关单管理创建入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { CustomsDeclarationForm } from '@/app/customs-declarations/components/CustomsDeclarationForm';
import { customsDeclarationService } from '@/services/customsDeclaration.service';
import type { CustomsDeclarationUpsertInput } from '@/services/customsDeclaration.service';

export default function CreateCustomsDeclarationPage() {
  const router = useRouter();

  const handleSubmit = async (payload: CustomsDeclarationUpsertInput) => {
    try {
      const response = await customsDeclarationService.create(payload);
      const createdId = response?.data?.id;
      toast.success('报关单创建成功');
      if (createdId) {
        router.push(`/dashboard/customs-declarations/${createdId}`);
      }
    } catch {
      toast.error('创建报关单失败');
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="新建报关单"
        description="录入出口报关基础信息、金额重量与商品申报明细。"
        backHref="/dashboard/tax-refunds?view=customs"
      />
      <CustomsDeclarationForm
        submitLabel="保存并查看详情"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
