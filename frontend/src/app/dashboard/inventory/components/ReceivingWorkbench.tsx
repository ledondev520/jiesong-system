/**
 * Input: 已发货采购合同列表（GET /purchases?status=SHIPPED，含到货子状态）、现有 PurchaseReceiptPanel
 * Output: 收货验货队列：阶段筛选（待到货/部分到货/已到齐待验收）→ 合同列表 → 侧栏里直接登记到货与验货
 * Pos: 库存页「收货验货」页签（PHASE3 §4 archetype C）；仓库人员不必逐个打开采购合同
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * v1 不新增接口：阶段只用合同到货量（登记数量对订购量）。「待复验」「今日已收」需要跨合同的验货汇总接口，
 * 见 PHASE3-PROPOSALS §4 的 v2；这里不用到货量去冒充验货状态。
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StageChips, type StageChip } from "@/components/ui/stage-chips";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileListCard } from "@/components/mobile";
import { useBusinessReadOnly } from "@/lib/hooks/useBusinessReadOnly";
import { formatDate } from "@/lib/date-format";
import { MISSING_VALUE } from "@/lib/missing-value";
import { PurchaseReceiptPanel } from "@/app/dashboard/purchases/[id]/components/PurchaseReceiptPanel";
import { purchaseService } from "@/services/purchase.service";
import type { PurchaseContract } from "@/types";

// 一次取够一屏队列；超过时明确提示，不悄悄截断。
const QUEUE_SIZE = 100;

type StageKey = "pending" | "partial" | "complete";

const STAGE_LABELS: Record<StageKey, string> = {
  pending: "待到货",
  partial: "部分到货",
  complete: "已到齐待验收",
};

const STAGE_HINTS: Record<StageKey, string> = {
  pending: "已发货，还没有登记任何到货。",
  partial: "已登记部分到货，仍有明细未到齐。",
  complete: "到货已登记齐；验货合格后合同自动转为已收货。",
};

/** 到货阶段只看登记的到货量；没有子状态（旧数据）按待到货。 */
export function stageOf(contract: PurchaseContract): StageKey {
  const state = contract.subStatus?.arrival.state;
  if (state === "FULL") return "complete";
  return state === "PARTIAL" ? "partial" : "pending";
}

const progress = (contract: PurchaseContract) => {
  const arrival = contract.subStatus?.arrival;
  return arrival ? `${arrival.arrived} / ${arrival.ordered}` : MISSING_VALUE;
};

export function ReceivingWorkbench() {
  const readOnly = useBusinessReadOnly();
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [stage, setStage] = useState<StageKey>("pending");
  // 保留打开时的合同：到货验货后它可能离开「已发货」队列，侧栏不应因此被关掉。
  const [opened, setOpened] = useState<PurchaseContract | null>(null);
  const request = useRef(0);

  // 首次加载的 loading 来自初始 state；只有重试/登记后刷新才在回调里重新置位（避免 effect 内同步 setState）。
  const fetchQueue = useCallback(() => {
    const current = ++request.current;
    purchaseService
      .getAll({ status: "SHIPPED", page: 1, pageSize: QUEUE_SIZE })
      .then((response) => {
        if (current !== request.current) return;
        setContracts(response.data?.items ?? []);
        setTotal(response.data?.pagination?.total ?? 0);
      })
      .catch((reason: unknown) => {
        if (current === request.current) setError(reason ?? true);
      })
      .finally(() => {
        if (current === request.current) setLoading(false);
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    fetchQueue();
    return () => {
      request.current += 1;
    };
  }, [fetchQueue]);

  const counts: Record<StageKey, number> = {
    pending: 0,
    partial: 0,
    complete: 0,
  };
  for (const contract of contracts) counts[stageOf(contract)] += 1;
  const stages: StageChip[] = (Object.keys(STAGE_LABELS) as StageKey[]).map(
    (key) => ({ key, label: STAGE_LABELS[key], count: counts[key] }),
  );
  const visible = contracts.filter((contract) => stageOf(contract) === stage);

  const actionLabel = readOnly ? "查看到货" : "登记到货 / 验货";
  const open = (contract: PurchaseContract) => setOpened(contract);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        已发货、等待收货的采购合同。点「{actionLabel}
        」在右侧直接登记到货和验货，不用逐个打开合同。
      </p>
      <StageChips
        stages={stages}
        value={stage}
        onChange={(key) => setStage(key as StageKey)}
        loading={loading || Boolean(error)}
        ariaLabel="收货阶段"
      />
      <p className="text-xs text-muted-foreground">{STAGE_HINTS[stage]}</p>

      {loading ? (
        <LoadingState title="加载待收货合同..." />
      ) : error ? (
        <ErrorState
          what="加载待收货合同失败"
          error={error === true ? undefined : error}
          onRetry={load}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={`没有「${STAGE_LABELS[stage]}」的合同`}
          description="其他阶段可在上方切换；合同发货后会出现在这里。"
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {visible.map((contract) => (
              <MobileListCard
                key={contract.id}
                title={contract.contractNo}
                subtitle={contract.supplier?.name ?? MISSING_VALUE}
                fields={[
                  {
                    label: "预计到货",
                    value: formatDate(contract.expectedDate, MISSING_VALUE),
                  },
                  { label: "到货进度", value: progress(contract) },
                  {
                    label: "发货店铺",
                    value: contract.storeName || MISSING_VALUE,
                  },
                ]}
                action={
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => open(contract)}
                  >
                    {actionLabel}
                  </Button>
                }
              />
            ))}
          </div>
          <div className="hidden overflow-hidden surface-panel md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>采购合同</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>发货店铺</TableHead>
                  <TableHead>预计到货</TableHead>
                  <TableHead>到货进度（已登记 / 订购）</TableHead>
                  <TableHead className="w-[140px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      {contract.contractNo}
                    </TableCell>
                    <TableCell>
                      {contract.supplier?.name ?? MISSING_VALUE}
                    </TableCell>
                    <TableCell>{contract.storeName || MISSING_VALUE}</TableCell>
                    <TableCell>
                      {formatDate(contract.expectedDate, MISSING_VALUE)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {progress(contract)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => open(contract)}>
                        {actionLabel}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {!loading && !error && total > contracts.length ? (
        <p className="text-xs text-muted-foreground">
          只显示最早的 {contracts.length} 条（共 {total}{" "}
          条已发货合同）；其余请到采购合同页按状态筛选。
        </p>
      ) : null}

      <Sheet
        open={opened !== null}
        onOpenChange={(next) => !next && setOpened(null)}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>{opened?.contractNo ?? "收货验货"}</SheetTitle>
            <SheetDescription>
              {opened?.supplier?.name ?? ""} ·
              与采购合同详情里的分批到货与验货是同一套记录。
            </SheetDescription>
          </SheetHeader>
          {opened ? (
            <PurchaseReceiptPanel
              purchaseContractId={opened.id}
              readOnly={readOnly}
              onChanged={load}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
