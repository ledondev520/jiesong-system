"use client";

import { Suspense, use } from "react";
import { QuoteDetailPageContent } from "../components/QuoteDetailPageContent";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <QuoteDetailPageContent id={id} />
    </Suspense>
  );
}
