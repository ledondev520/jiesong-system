/**
 * Input: 单号、状态、3-5 个关键事实、唯一主操作、「单证」/「更多」菜单项、阻塞原因
 * Output: 记录页（出口订单/采购合同/报关单/退税记录）统一头部：事实 chips、一个主按钮、菜单、阻塞提示条
 * Pos: 通用布局组件，基于 PageHeader（PHASE3 §1 archetype B）
 */

"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MISSING_VALUE, isMissing } from "@/lib/missing-value";

export interface RecordFact {
  label: string;
  /** 缺失显示「—」，不是 0 或空 */
  value: ReactNode | null | undefined;
}

export interface RecordMenuItem {
  key: string;
  label: string;
  /** 返回的 Promise 被拒绝时，菜单会弹出错误提示，不会静默吞掉；调用方仍可自行处理更具体的错误 */
  onSelect: () => void | Promise<void>;
  /** 破坏性操作：只允许放进「更多」，选中后先弹确认，确认才执行 */
  destructive?: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  disabled?: boolean;
}

export interface RecordBlocker {
  /** 主操作为什么现在不能点 */
  reason: string;
  /** 「去处理」：跳到对应页签或页面 */
  actionLabel?: string;
  onAction?: () => void;
}

interface RecordHeaderProps {
  number: string;
  /** 一般传 <StatusBadge /> */
  status?: ReactNode;
  facts?: readonly RecordFact[];
  /** 状态驱动的唯一主按钮；被阻塞时请传 disabled 的按钮并同时传 blocker */
  primaryAction?: ReactNode;
  documentsMenu?: readonly RecordMenuItem[];
  moreMenu?: readonly RecordMenuItem[];
  blocker?: RecordBlocker;
  backHref?: string;
  onBack?: () => void;
}

function reportFailure(error: unknown) {
  toast.error(
    error instanceof Error && error.message
      ? error.message
      : "操作失败，请重试",
  );
}

function runItem(item: RecordMenuItem) {
  try {
    void Promise.resolve(item.onSelect()).catch(reportFailure);
  } catch (error) {
    reportFailure(error);
  }
}

function ActionMenu({
  label,
  items,
}: {
  label: string;
  items: readonly RecordMenuItem[];
}) {
  const [pending, setPending] = useState<RecordMenuItem | null>(null);
  if (items.length === 0) return null;

  // 对话框放在菜单外，避免菜单关闭时卸载
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1">
            {label}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {item.destructive && index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={item.disabled}
                variant={item.destructive ? "destructive" : "default"}
                onSelect={() =>
                  item.destructive ? setPending(item) : runItem(item)
                }
              >
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.confirmTitle ?? `确认${pending?.label ?? ""}？`}
        description={pending?.confirmDescription ?? "此操作确认后立即生效。"}
        confirmLabel={pending?.label}
        onConfirm={() => {
          const item = pending;
          setPending(null);
          if (item) runItem(item);
        }}
      />
    </>
  );
}

export function RecordHeader({
  number,
  status,
  facts = [],
  primaryAction,
  documentsMenu = [],
  moreMenu = [],
  blocker,
  backHref,
  onBack,
}: RecordHeaderProps) {
  // 破坏性操作只允许出现在「更多」，「单证」里即使传入也丢弃
  const documentItems = documentsMenu.filter((item) => !item.destructive);

  return (
    <div className="space-y-3">
      <PageHeader
        title={number}
        titleClassName="font-mono"
        backHref={backHref}
        onBack={onBack}
        actions={
          <>
            {status}
            {primaryAction}
            <ActionMenu label="单证" items={documentItems} />
            <ActionMenu label="更多" items={moreMenu} />
          </>
        }
      />
      {facts.length > 0 && (
        <dl className="flex flex-wrap gap-2">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-baseline gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm"
            >
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="font-medium">
                {isMissing(fact.value) ? MISSING_VALUE : fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {blocker && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-status-amber/30 bg-status-amber-soft px-3 py-2 text-sm text-status-amber"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{blocker.reason}</span>
          {blocker.actionLabel && blocker.onAction && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={blocker.onAction}
            >
              {blocker.actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
