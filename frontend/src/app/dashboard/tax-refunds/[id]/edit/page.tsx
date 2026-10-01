/**
 * Input: 退税单 ID、taxRefundService、router、toast
 * Output: 编辑退税单页面
 * Pos: 退税管理编辑入口
 */

'use client';

import { Suspense, use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { TaxRefund } from '@/types';
import { taxRefundService, type TaxRefundUpsertInput } from '@/services/taxRefund.service';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data-state';
import { clearApiGetCache } from '@/lib/axios';
import { TaxRefundForm } from '../../components/TaxRefundForm';

interface EditTaxRefundContentProps {
  params: Promise<{ id: string }>;
}

function EditTaxRefundContent({ params }: EditTaxRefundContentProps) {
  const { id } = use(params);
  const router = useRouter();
  const [taxRefund, setTaxRefund] = useState<TaxRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadTaxRefund = useCallback(async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const response = await taxRefundService.getById(id);
        setTaxRefund(response?.data || null);
      } catch {
        setLoadError(true);
        toast.error('加载退税记录失败');
      } finally {
        setLoading(false);
      }
  }, [id]);
  useEffect(() => { void loadTaxRefund(); }, [loadTaxRefund]);

  const handleSubmit = async (payload: TaxRefundUpsertInput) => {
    try {
      await taxRefundService.update(id, payload);
      toast.success('退税记录更新成功');
      router.push(`/dashboard/tax-refunds/${id}`);
    } catch {
      toast.error('更新退税记录失败');
    }
  };

  if (loading) {
    return <div className="py-14 text-center text-muted-foreground">加载中...</div>;
  }

  if (loadError) return <ErrorState title="退税记录读取失败" action={<Button onClick={() => { clearApiGetCache(); void loadTaxRefund(); }}>重试</Button>} />;

  if (!taxRefund) {
    return <div className="py-14 text-center text-muted-foreground">退税记录不存在</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="编辑退税单"
        description={`更新 ${taxRefund.refundNo} 的状态、金额与到账信息。`}
        backHref={`/dashboard/tax-refunds/${id}`}
      />
      <TaxRefundForm taxRefund={taxRefund} submitLabel="保存变更" onSubmit={handleSubmit} />
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditTaxRefundPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <EditTaxRefundContent params={params} />
    </Suspense>
  );
}
