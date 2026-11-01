/**
 * Input: 旧收付管理 URL（?tab=payable|receivable、overdue、pastDelivery）
 * Output: 服务端重定向到 /dashboard/finance/payable 或 /receivable，保留 overdue / pastDelivery
 * Pos: 旧 URL 重定向桩（UX 规范 §3.4）；应付/应收列表、收款池分别在两个财务页签里
 */
import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export function financeRedirectTarget(params: SearchParams = {}): string {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  if (first("tab") === "receivable") {
    return first("overdue") === "true"
      ? "/dashboard/finance/receivable?overdue=true"
      : "/dashboard/finance/receivable";
  }
  // 默认视图一直是应付（旧页 tab 缺省 = payable）
  return first("pastDelivery") === "true"
    ? "/dashboard/finance/payable?pastDelivery=true"
    : "/dashboard/finance/payable";
}

export default async function PaymentsRedirect({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  redirect(financeRedirectTarget(await searchParams));
}
