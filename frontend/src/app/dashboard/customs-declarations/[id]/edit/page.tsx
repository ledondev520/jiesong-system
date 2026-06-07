/**
 * Input: 报关单 ID、customsDeclarationService、router、toast
 * Output: 编辑报关单页面
 * Pos: 报关单管理编辑入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CustomsDeclaration } from '@/types';
import {
  customsDeclarationService,
  type CustomsDeclarationUpsertInput,
} from '@/services/customsDeclaration.service';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { CustomsDeclarationForm } from '@/app/customs-declarations/components/CustomsDeclarationForm';

interface EditCustomsDeclarationContentProps {
  params: Promise<{ id: string }>;
}

function EditCustomsDeclarationContent({
  params,
}: EditCustomsDeclarationContentProps) {
  const { id } = use(params);
  const router = useRouter();
  const [declaration, setDeclaration] = useState<CustomsDeclaration | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDeclaration = async () => {
      setLoading(true);
      try {
        const response = await customsDeclarationService.getById(id);
        setDeclaration(response?.data || null);
      } catch {
        toast.error('加载报关单失败');
      } finally {
        setLoading(false);
      }
    };

    void loadDeclaration();
  }, [id]);

  const handleSubmit = async (payload: CustomsDeclarationUpsertInput) => {
    try {
      await customsDeclarationService.update(id, payload);
      toast.success('报关单更新成功');
      router.push(`/dashboard/customs-declarations/${id}`);
    } catch {
      toast.error('更新报关单失败');
    }
  };

  if (loading) {
    return <div className="py-14 text-center text-muted-foreground">加载中...</div>;
  }

  if (!declaration) {
    return <div className="py-14 text-center text-muted-foreground">报关单不存在</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="编辑报关单"
        description={`更新 ${declaration.declarationNo} 的申报字段与商品明细。`}
        backHref={`/dashboard/customs-declarations/${id}`}
      />
      <CustomsDeclarationForm
        declaration={declaration}
        submitLabel="保存变更"
        onSubmit={handleSubmit}
      />
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditCustomsDeclarationPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <EditCustomsDeclarationContent params={params} />
    </Suspense>
  );
}
