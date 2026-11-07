import { Suspense } from "react";
import { CustomsDeclarationDetailPageContent } from "@/app/dashboard/customs/components/CustomsDeclarationDetailPageContent";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomsDeclarationDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CustomsDeclarationDetailPageContent params={params} />
    </Suspense>
  );
}
