import { Suspense } from "react";
import { TaxRefundDetailPageContent } from "../components/TaxRefundDetailPageContent";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TaxRefundDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <TaxRefundDetailPageContent params={params} />
    </Suspense>
  );
}
