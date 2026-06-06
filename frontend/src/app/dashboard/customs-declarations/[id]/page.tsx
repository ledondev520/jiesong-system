import { Suspense } from 'react';
import { CustomsDeclarationDetailPageContent } from '@/app/customs-declarations/components/CustomsDeclarationDetailPageContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomsDeclarationDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <CustomsDeclarationDetailPageContent params={params} />
    </Suspense>
  );
}
