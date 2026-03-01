'use client';

import { Suspense } from 'react';
import DataImportPage from './components/DataImportPageContent';

export default function Page() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <DataImportPage />
    </Suspense>
  );
}
