import { Suspense } from 'react';
import { CustomsDeclarationListPageContent } from '@/app/customs-declarations/components/CustomsDeclarationListPageContent';

export default function CustomsDeclarationsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <CustomsDeclarationListPageContent />
    </Suspense>
  );
}
