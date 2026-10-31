/**
 * Input: 旧详情路由的合同 id
 * Output: 重定向到 /dashboard/purchases/[id]
 * Pos: 旧 `/dashboard/purchase/[id]` 兼容入口（重定向 stub）
 */
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseDetailRedirectPage({
  params,
}: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/purchases/${encodeURIComponent(id)}`);
}
