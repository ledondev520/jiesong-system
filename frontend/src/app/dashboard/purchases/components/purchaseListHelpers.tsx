/**
 * Input: PurchaseStatus、PurchaseContract 类型
 * Output: 采购列表共用的状态徽章（StatusBadge 映射）、状态色条、金额与分页页码辅助
 * Pos: 采购列表页（ContractsPageContent）拆出的纯展示辅助；草稿/已取消状态明确标注不计应付（应付口径白名单见 isPayable）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { PurchaseContract, PurchaseItem, PurchaseStatus } from "@/types";
import { StatusBadge } from "@/components/ui/status-badge";

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
 * 职责：列表/弹窗里的合同状态；颜色与文案统一来自 StatusBadge 的 purchaseContract 映射，
 * 这里只补草稿「不计应付」的悬停说明
 */
export function StatusPill({ status }: { status: PurchaseStatus }) {
  return (
    <span
      title={
        status === PurchaseStatus.DRAFT
          ? "草稿合同尚未生效，不计入应付"
          : undefined
      }
    >
      <StatusBadge domain="purchaseContract" status={status} />
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
      return "var(--status-blue)";
    case PurchaseStatus.PRODUCING:
    case PurchaseStatus.READY:
    case PurchaseStatus.SHIPPED:
      return "var(--status-amber)";
    case PurchaseStatus.RECEIVED:
    case PurchaseStatus.COMPLETED:
      return "var(--status-green)";
    case PurchaseStatus.CANCELLED:
      return "var(--status-red)";
    default:
      return "var(--status-green)";
  }
};

/**
 * 职责：金额格式化（CNY=绿色）
 */
export function formatAmount(amount: number) {
  return (
    <span className="font-medium tabular-nums text-status-green">
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

/** 职责：已付超过合同金额的差额（0 表示未超付）；与详情页同口径，仅在合同金额已录入时比较 */
export function getOverpaidAmount(
  contract: Pick<PurchaseContract, "totalAmount" | "paidAmount">,
): number {
  // 合同金额为 0 时详情页改比明细合计，列表因 items.take(1) 没有明细合计；该行已显示「未录入」，不在此误报超付
  if (contract.totalAmount <= 0) return 0;
  const diff =
    Math.round((contract.paidAmount - contract.totalAmount) * 100) / 100;
  return diff > 0.02 ? diff : 0;
}

/** 职责：列表中醒目的超付标记，替代只在详情页小字提示 */
export function OverpaidFlag({
  contract,
}: {
  contract: Pick<PurchaseContract, "totalAmount" | "paidAmount">;
}) {
  const overpaid = getOverpaidAmount(contract);
  if (overpaid === 0) return null;
  return (
    <span
      className="mt-0.5 inline-flex w-fit items-center rounded border border-status-red/30 bg-status-red-soft px-1.5 py-0.5 text-[11px] font-medium text-status-red"
      data-testid="overpaid-flag"
      title="已付金额超过合同金额，请核对合同金额或付款记录"
    >
      超付 ¥{overpaid.toLocaleString()}
    </span>
  );
}
