/**
 * Input: 旧新增/更正入口的 editId 查询参数
 * Output: 重定向到 /dashboard/purchases/new（保留 editId）
 * Pos: 旧 `/dashboard/purchase/create` 兼容入口（重定向 stub）
 */
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ editId?: string | string[] }>;
}

export default async function PurchaseCreateRedirectPage({
  searchParams,
}: PageProps) {
  const { editId } = await searchParams;
  const id = Array.isArray(editId) ? editId[0] : editId;
  redirect(
    id
      ? `/dashboard/purchases/new?editId=${encodeURIComponent(id)}`
      : "/dashboard/purchases/new",
  );
}
