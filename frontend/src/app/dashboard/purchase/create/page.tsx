'use client';

import { Suspense } from 'react';
import CreatePurchasePage from './components/CreatePurchasePageContent';

export default function Page() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <CreatePurchasePage />
    </Suspense>
  );
}
