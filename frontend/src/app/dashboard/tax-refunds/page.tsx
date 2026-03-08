import { Suspense } from 'react';
import { TaxRefundListPageContent } from './components/TaxRefundListPageContent';

export default function TaxRefundsDashboardPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <TaxRefundListPageContent />
    </Suspense>
  );
}
