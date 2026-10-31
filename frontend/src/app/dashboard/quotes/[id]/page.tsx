"use client";

import { Suspense, use } from "react";
import { QuoteDetailPageContent } from "../components/QuoteDetailPageContent";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <QuoteDetailPageContent id={id} />
    </Suspense>
  );
}
