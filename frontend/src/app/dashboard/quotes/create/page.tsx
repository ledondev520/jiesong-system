/**
 * Input: route /dashboard/quotes/create (the /create segment keeps BOSS read-only via isBossRestrictedPath)
 * Output: new quote form; after saving, opens the quote (and marks it sent when asked)
 * Pos: 出口 module 报价
 */
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { quoteService } from "@/services/quote.service";
import { QuoteEditor } from "../components/QuoteEditor";

export default function CreateQuotePage() {
  const router = useRouter();
  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="新建报价" description="填写商品、门店和参考成本；单价由唯一报价规则自动算出，也可手动覆盖。" backHref="/dashboard/quotes" />
      <QuoteEditor
        onSaved={async (quote, { markSent }) => {
          if (markSent) {
            try {
              await quoteService.transition(quote.id, "SENT");
            } catch (error) {
              toast.error(error instanceof Error && error.message ? error.message : "已保存为草稿，但标记已发送失败");
            }
          }
          toast.success(`报价 ${quote.quoteNo} 已保存`);
          router.push(`/dashboard/quotes/${quote.id}`);
        }}
      />
    </div>
  );
}
