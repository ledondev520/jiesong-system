import { Suspense } from 'react';
import { TaxRefundDetailPageContent } from '../components/TaxRefundDetailPageContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TaxRefundDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <TaxRefundDetailPageContent params={params} />
    </Suspense>
  );
}
