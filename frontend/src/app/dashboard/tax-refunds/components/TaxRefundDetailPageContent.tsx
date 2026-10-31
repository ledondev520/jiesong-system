/**
 * Input: 退税单 ID、taxRefundService、router
 * Output: 退税单详情页
 * Pos: 退税管理详情展示页
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { FilePenLine } from "lucide-react";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import type { TaxRefund } from "@/types";
import { taxRefundService } from "@/services/taxRefund.service";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForexVerificationPanel } from "@/components/finance/ForexVerificationPanel";
import { ErrorState } from "@/components/ui/data-state";
import { clearApiGetCache } from "@/lib/axios";
import { TaxRefundStatusBadge } from "./TaxRefundStatusBadge";

interface TaxRefundDetailPageContentProps {
  params: Promise<{ id: string }>;
}

const detailFields = (taxRefund: TaxRefund) => [
  { label: "出口合同 ID", value: taxRefund.salesContractId },
  { label: "报关单 ID", value: taxRefund.customsDeclarationId },
  { label: "申请日期", value: taxRefund.appliedAt },
  { label: "到账日期", value: taxRefund.refundedAt || "-" },
];

export function TaxRefundDetailPageContent({
  params,
}: TaxRefundDetailPageContentProps) {
  const { id } = use(params);
  const router = useRouter();
  const [taxRefund, setTaxRefund] = useState<TaxRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 本次渲染已按新 id 重置 loading/error、但对应 effect 尚未发出请求时为 true：
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
          if (!resetPendingRef.current) setError(true);
          toast.error("加载退税详情失败");
        },
        () => {
          if (!resetPendingRef.current) setLoading(false);
        },
      ),
    [id],
  );

  const loadTaxRefund = useCallback(() => {
    setLoading(true);
    setError(false);
    return requestTaxRefund();
  }, [requestTaxRefund]);

  // 原先 effect 内的 setLoading(true)/setError(false) 改为 id 变化时在渲染期执行；
  // 挂载时初值即为 true/false，与原先挂载 effect 的写入相同。
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setLoading(true);
    setError(false);
  }

  useLayoutEffect(() => {
    resetPendingRef.current = true;
  }, [requestTaxRefund]);

  useEffect(() => {
    resetPendingRef.current = false;
    void requestTaxRefund();
  }, [requestTaxRefund]);

  if (loading) {
    return (
      <div className="py-14 text-center text-muted-foreground">加载中...</div>
    );
  }

  if (error)
    return (
      <ErrorState
        title="退税详情读取失败"
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
        title={taxRefund.refundNo}
        description="查看当前退税批次的金额与关联单据。"
        backHref="/dashboard/customs"
        actions={
          <>
            <TaxRefundStatusBadge status={taxRefund.status} />
            <BusinessWrite>
              <Button
                className="rounded-xl"
                onClick={() =>
                  router.push(`/dashboard/tax-refunds/${taxRefund.id}/edit`)
                }
              >
                <FilePenLine className="mr-2 h-4 w-4" />
                编辑退税单
              </Button>
            </BusinessWrite>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              申报金额
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {taxRefund.declaredAmount.toLocaleString()}
          </CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              可退金额
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {taxRefund.refundableAmount.toLocaleString()}
          </CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              已退金额
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {taxRefund.refundedAmount.toLocaleString()}
          </CardContent>
        </Card>
      </div>

      <ForexVerificationPanel salesContractId={taxRefund.salesContractId} />
      <Card className="surface-panel">
        <CardHeader>
          <CardTitle>单证关联</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {detailFields(taxRefund).map((field) => (
            <div key={field.label} className="space-y-1">
              <div className="text-sm text-muted-foreground">{field.label}</div>
              <div className="font-medium">{field.value}</div>
            </div>
          ))}
          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <div className="text-sm text-muted-foreground">备注</div>
            <div className="font-medium">{taxRefund.note || "-"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
