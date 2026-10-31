/**
 * Input: route /dashboard/quotes/create (the /create segment keeps BOSS read-only via isBossRestrictedPath)
 * Output: new quote form; after saving, opens the quote (and marks it sent when asked)
 * Pos: 出口 module 报价
 */
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth.store";
import { quoteService } from "@/services/quote.service";
import { QuoteEditor } from "../components/QuoteEditor";
import { QUOTE_WRITE_ROLES } from "../components/quoteRoles";

export default function CreateQuotePage() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  if (!role || !QUOTE_WRITE_ROLES.includes(role)) {
    return (
      <div className="space-y-6 pb-10">
        <PageHeader
          title="新建报价"
          description="仅管理员和销售可以新建报价。"
          backHref="/dashboard/quotes"
        />
      </div>
    );
  }
  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="新建报价"
        description="填写商品、门店和参考成本；单价由唯一报价规则自动算出，也可手动覆盖。"
        backHref="/dashboard/quotes"
      />
      <QuoteEditor
        onSaved={async (quote, { markSent }) => {
          if (markSent) {
            try {
              await quoteService.transition(quote.id, "SENT");
            } catch (error) {
              toast.error(
                error instanceof Error && error.message
                  ? error.message
                  : "已保存为草稿，但标记已发送失败",
              );
            }
          }
          toast.success(`报价 ${quote.quoteNo} 已保存`);
          router.push(`/dashboard/quotes/${quote.id}`);
        }}
      />
    </div>
  );
}
