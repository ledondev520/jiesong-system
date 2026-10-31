/**
 * Input: 报关单 id 与旧详情的查询参数（returnTo 等）
 * Output: 重定向到 /dashboard/customs/[id]，保留查询参数
 * Pos: 旧报关单详情入口兼容 stub
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomsDeclarationDetailRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : '';
  redirect(`/dashboard/customs/${encodeURIComponent(id)}${suffix}`);
}
