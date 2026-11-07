import { redirect } from "next/navigation";
import { withQuery, type RedirectSearchParams } from "@/lib/redirect-query";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<RedirectSearchParams>;
}

export default async function EditCustomsDeclarationRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  redirect(
    withQuery(
      `/dashboard/customs/${encodeURIComponent(id)}/edit`,
      await searchParams,
    ),
  );
}
