/**
 * Input: PurchaseStatus、PurchaseContract 类型
 * Output: 采购列表共用的状态 pill、状态色条、金额与分页页码辅助
 * Pos: 采购列表页（ContractsPageContent）拆出的纯展示辅助；草稿/已取消状态明确标注不计应付（应付口径白名单见 isPayable）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { PurchaseContract, PurchaseItem, PurchaseStatus } from "@/types";
import {
  Circle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Truck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 扩展类型
export interface PurchaseContractDetail extends PurchaseContract {
  items?: PurchaseItem[];
}

export interface TemplateInfoItem {
  exists: boolean;
  filename?: string;
  size?: number;
  updatedAt?: string;
}

/**
 * 职责：生成分页页码数组
 */
export function getPageNumbers(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (current > 4) pages.push("ellipsis");
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 3) pages.push("ellipsis");
  if (total > 1) pages.push(total);
  return pages;
}

/**
 * 职责：状态 pill 组件（带图标）
 */
export function StatusPill({ status }: { status: PurchaseStatus }) {
  const config: Record<
    PurchaseStatus,
    { label: string; icon: React.ReactNode; className: string }
  > = {
    [PurchaseStatus.DRAFT]: {
      label: "草稿",
      icon: <Circle className="h-3 w-3 fill-current" />,
      className:
        "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800",
    },
    [PurchaseStatus.SIGNED]: {
      label: "已确认",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    },
    [PurchaseStatus.PRODUCING]: {
      label: "生产中",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      className:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
    },
    [PurchaseStatus.READY]: {
      label: "生产完成",
      icon: <PackageCheck className="h-3 w-3" />,
      className:
        "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800",
    },
    [PurchaseStatus.SHIPPED]: {
      label: "已发货",
      icon: <Truck className="h-3 w-3" />,
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800",
    },
    [PurchaseStatus.RECEIVED]: {
      label: "已收货",
      icon: <PackageCheck className="h-3 w-3" />,
      className:
        "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:border-violet-800",
    },
    [PurchaseStatus.COMPLETED]: {
      label: "已完成",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    },
    [PurchaseStatus.CANCELLED]: {
      label: "已取消",
      icon: <X className="h-3 w-3" />,
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
    },
  };

  const c = config[status] || config[PurchaseStatus.DRAFT];

  return (
    <span
      title={
        status === PurchaseStatus.DRAFT
          ? "草稿合同尚未生效，不计入应付"
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        c.className,
      )}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

/**
 * 职责：根据采购状态返回左侧色条颜色
 */
export const getPurchaseStatusColor = (status: PurchaseStatus) => {
  switch (status) {
    case PurchaseStatus.DRAFT:
    case PurchaseStatus.SIGNED:
      return "#3b82f6";
    case PurchaseStatus.PRODUCING:
    case PurchaseStatus.READY:
    case PurchaseStatus.SHIPPED:
      return "#f59e0b";
    case PurchaseStatus.RECEIVED:
    case PurchaseStatus.COMPLETED:
      return "#10b981";
    case PurchaseStatus.CANCELLED:
      return "#ef4444";
    default:
      return "#10b981";
  }
};

/**
 * 职责：金额格式化（CNY=绿色）
 */
export function formatAmount(amount: number) {
  return (
    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
      ¥{amount.toLocaleString()}
    </span>
  );
}

/**
 * 职责：应付口径白名单（规格 §4.7 / 负责人决定 12，与后端 payablesService 一致）：
 * 仅「已生效」状态计入应付；DRAFT、CANCELLED 以及任何未知状态都不计入
 */
const PAYABLE_STATUSES: readonly PurchaseStatus[] = [
  PurchaseStatus.SIGNED,
  PurchaseStatus.PRODUCING,
  PurchaseStatus.READY,
  PurchaseStatus.SHIPPED,
  PurchaseStatus.RECEIVED,
  PurchaseStatus.COMPLETED,
];

export const isPayable = (contract: Pick<PurchaseContract, "status">) =>
  PAYABLE_STATUSES.includes(contract.status);

/**
 * 职责：不计应付合同在详情页「待付金额」位置显示的状态化文案
 */
export const nonPayableNotice = (status: PurchaseStatus) =>
  status === PurchaseStatus.CANCELLED
    ? { title: "已取消 · 不计应付", hint: "已取消的合同不计入待付金额" }
    : { title: "草稿 · 不计应付", hint: "合同生效后才计入待付金额" };
