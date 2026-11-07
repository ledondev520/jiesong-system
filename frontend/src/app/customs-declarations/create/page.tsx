import { redirect } from "next/navigation";
import { withQuery, type RedirectSearchParams } from "@/lib/redirect-query";

export default async function CreateCustomsDeclarationRedirectPage({
  searchParams,
}: {
  searchParams: Promise<RedirectSearchParams>;
}) {
  redirect(withQuery("/dashboard/customs/new", await searchParams));
}
