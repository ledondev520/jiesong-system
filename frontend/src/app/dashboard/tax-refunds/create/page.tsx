/**
 * Input: taxRefundService、router、toast
 * Output: 新建退税单页面
 * Pos: 退税管理创建入口
 */

'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { TaxRefundForm } from '../components/TaxRefundForm';
import { taxRefundService, type TaxRefundUpsertInput } from '@/services/taxRefund.service';

export default function CreateTaxRefundPage() {
  const router = useRouter();

  const handleSubmit = async (payload: TaxRefundUpsertInput) => {
    try {
      const response = await taxRefundService.create(payload);
      const createdId = response?.data?.id;
      toast.success('退税记录创建成功');
      if (createdId) {
        router.push(`/dashboard/tax-refunds/${createdId}`);
      }
    } catch {
      toast.error('创建退税记录失败');
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="新建退税单"
        description="录入退税批次主键、金额与申报时间。"
        backHref="/dashboard/tax-refunds"
      />
      <TaxRefundForm submitLabel="保存并查看详情" onSubmit={handleSubmit} />
    </div>
  );
}
