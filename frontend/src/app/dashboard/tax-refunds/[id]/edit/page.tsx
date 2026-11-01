/**
 * Input: 退税单 ID、taxRefundService、router、toast
 * Output: 编辑退税单页面
 * Pos: 退税管理编辑入口
 */

"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import type { TaxRefund } from "@/types";
import {
  taxRefundService,
  type TaxRefundUpsertInput,
} from "@/services/taxRefund.service";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/data-state";
import { clearApiGetCache } from "@/lib/axios";
import { TaxRefundForm } from "../../components/TaxRefundForm";

interface EditTaxRefundContentProps {
  params: Promise<{ id: string }>;
}

function EditTaxRefundContent({ params }: EditTaxRefundContentProps) {
  const { id } = use(params);
  const router = useRouter();
  const [taxRefund, setTaxRefund] = useState<TaxRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 本次渲染已按新 id 重置 loading/loadError、但对应 effect 尚未发出请求时为 true：
  // 原先这两个状态在 effect 内同步重置，窗口内落地的旧请求对它们的写入会被随后的重置覆盖，
  // 因此窗口内只跳过这两项写入，数据与提示照常写入。
  const resetPendingRef = useRef(false);

  const requestTaxRefund = useCallback(
    () =>
      runAwait(
        () => taxRefundService.getById(id),
        (response) => {
          setTaxRefund(response?.data || null);
        },
        () => {
          if (!resetPendingRef.current) setLoadError(true);
          toast.error("加载退税记录失败");
        },
        () => {
          if (!resetPendingRef.current) setLoading(false);
        },
      ),
    [id],
  );

  const loadTaxRefund = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    return requestTaxRefund();
  }, [requestTaxRefund]);

  // 原先 effect 内的 setLoading(true)/setLoadError(false) 改为 id 变化时在渲染期执行；
  // 挂载时初值即为 true/false，与原先挂载 effect 的写入相同。
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setLoading(true);
    setLoadError(false);
  }

  useLayoutEffect(() => {
    resetPendingRef.current = true;
  }, [requestTaxRefund]);

  useEffect(() => {
    resetPendingRef.current = false;
    void requestTaxRefund();
  }, [requestTaxRefund]);

  const handleSubmit = async (payload: TaxRefundUpsertInput) => {
    try {
      await taxRefundService.update(id, payload);
      toast.success("退税记录更新成功");
      router.push(`/dashboard/tax-refunds/${id}`);
    } catch {
      toast.error("更新退税记录失败");
    }
  };

  if (loading) {
    return (
      <div className="py-14 text-center text-muted-foreground">加载中...</div>
    );
  }

  if (loadError)
    return (
      <ErrorState
        title="退税记录读取失败"
        action={
          <Button
            onClick={() => {
              clearApiGetCache();
              void loadTaxRefund();
            }}
          >
            重试
          </Button>
        }
      />
    );

  if (!taxRefund) {
    return (
      <div className="py-14 text-center text-muted-foreground">
        退税记录不存在
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="编辑退税单"
        description={`更新 ${taxRefund.refundNo} 的状态、金额与到账信息。`}
        backHref={`/dashboard/tax-refunds/${id}`}
      />
      <TaxRefundForm
        taxRefund={taxRefund}
        submitLabel="保存变更"
        onSubmit={handleSubmit}
      />
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditTaxRefundPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-muted-foreground">加载中...</div>
      }
    >
      <EditTaxRefundContent params={params} />
    </Suspense>
  );
}
