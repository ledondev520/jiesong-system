'use client';

import { Suspense } from 'react';
import ContractsPageContent from './components/ContractsPageContent';

export default function ContractsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <ContractsPageContent />
    </Suspense>
  );
}
