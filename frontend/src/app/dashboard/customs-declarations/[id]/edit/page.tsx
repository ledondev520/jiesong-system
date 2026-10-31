/**
 * Input: 报关单 id
 * Output: 重定向到 /dashboard/customs/[id]/edit
 * Pos: 旧编辑报关单入口兼容 stub
 */
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCustomsDeclarationRedirectPage({
  params,
}: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/customs/${encodeURIComponent(id)}/edit`);
}
