'use client';

import { Suspense } from 'react';
import SalesDetailPage from './components/SalesDetailPageContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <SalesDetailPage params={params} />
    </Suspense>
  );
}
