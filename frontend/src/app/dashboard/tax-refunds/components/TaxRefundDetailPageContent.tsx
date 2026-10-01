/**
 * Input: 退税单 ID、taxRefundService、router
 * Output: 退税单详情页
 * Pos: 退税管理详情展示页
 */

'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FilePenLine } from 'lucide-react';
import { toast } from 'sonner';
import type { TaxRefund } from '@/types';
import { taxRefundService } from '@/services/taxRefund.service';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ForexVerificationPanel } from '@/components/finance/ForexVerificationPanel';
import { ErrorState } from '@/components/ui/data-state';
import { clearApiGetCache } from '@/lib/axios';
import { TaxRefundStatusBadge } from './TaxRefundStatusBadge';

interface TaxRefundDetailPageContentProps {
  params: Promise<{ id: string }>;
}

const detailFields = (taxRefund: TaxRefund) => [
  { label: '出口合同 ID', value: taxRefund.salesContractId },
  { label: '报关单 ID', value: taxRefund.customsDeclarationId },
  { label: '申请日期', value: taxRefund.appliedAt },
  { label: '到账日期', value: taxRefund.refundedAt || '-' },
];

export function TaxRefundDetailPageContent({ params }: TaxRefundDetailPageContentProps) {
  const { id } = use(params);
  const router = useRouter();
  const [taxRefund, setTaxRefund] = useState<TaxRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadTaxRefund = useCallback(async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await taxRefundService.getById(id);
        setTaxRefund(response?.data || null);
      } catch {
        setError(true);
        toast.error('加载退税详情失败');
      } finally {
        setLoading(false);
      }
  }, [id]);
  useEffect(() => { void loadTaxRefund(); }, [loadTaxRefund]);

  if (loading) {
    return <div className="py-14 text-center text-muted-foreground">加载中...</div>;
  }

  if (error) return <ErrorState title="退税详情读取失败" action={<Button onClick={() => { clearApiGetCache(); void loadTaxRefund(); }}>重试</Button>} />;

  if (!taxRefund) {
    return <div className="py-14 text-center text-muted-foreground">退税记录不存在</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title={taxRefund.refundNo}
        description="查看当前退税批次的金额与关联单据。"
        backHref="/dashboard/tax-refunds"
        actions={
          <>
            <TaxRefundStatusBadge status={taxRefund.status} />
            <Button className="rounded-xl" onClick={() => router.push(`/dashboard/tax-refunds/${taxRefund.id}/edit`)}>
              <FilePenLine className="mr-2 h-4 w-4" />
              编辑退税单
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">申报金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{taxRefund.declaredAmount.toLocaleString()}</CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">可退金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{taxRefund.refundableAmount.toLocaleString()}</CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">已退金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{taxRefund.refundedAmount.toLocaleString()}</CardContent>
        </Card>
      </div>

      <ForexVerificationPanel salesContractId={taxRefund.salesContractId} />
      <Card className="surface-panel">
        <CardHeader>
          <CardTitle>单证关联</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {detailFields(taxRefund).map((field) => (
            <div key={field.label} className="space-y-1">
              <div className="text-sm text-muted-foreground">{field.label}</div>
              <div className="font-medium">{field.value}</div>
            </div>
          ))}
          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <div className="text-sm text-muted-foreground">备注</div>
            <div className="font-medium">{taxRefund.note || '-'}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
