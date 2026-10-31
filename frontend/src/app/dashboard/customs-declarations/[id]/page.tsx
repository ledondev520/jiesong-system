/**
 * Input: 报关单 id 与旧详情的查询参数（returnTo 等）
 * Output: 重定向到 /dashboard/customs/[id]，保留查询参数
 * Pos: 旧报关单详情入口兼容 stub
 */
import { redirect } from "next/navigation";
import { withQuery } from "@/lib/redirect-query";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomsDeclarationDetailRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  redirect(
    withQuery(
      `/dashboard/customs/${encodeURIComponent(id)}`,
      await searchParams,
    ),
  );
}
