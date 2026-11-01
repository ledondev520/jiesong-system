/**
 * Input: 合同状态 status 与后端派生的 subStatus（付款/到货/生产资料）
 * Output: 紧挨主状态的子状态徽章，让「已完成」不再冒充已付清或已到货
 * Pos: 采购列表、采购详情、应付列表、订单采购页共用；只做语义文案，沿用 SemanticBadge 色调，不新增样式
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { SemanticBadge } from "@/components/ui/status-badge";
import type { PurchaseSubStatus as SubStatus } from "@/types";

type Tone = "success" | "warning" | "danger" | "neutral";
export type SubStatusBadge = { key: string; label: string; tone: Tone };

const PAYMENT: Record<string, SubStatusBadge | undefined> = {
  UNPAID: { key: "payment", label: "未付款", tone: "warning" },
  PARTIAL: { key: "payment", label: "部分付款", tone: "warning" },
  PAID: { key: "payment", label: "已付清", tone: "success" },
};

/** 草稿和已取消没有付款、到货义务，不显示子状态。 */
const NO_OBLIGATION = new Set(["DRAFT", "CANCELLED"]);
/** 这些状态按流程应已收货；此时没有任何到货登记说明是历史数据，不能写成「未到货」。 */
const SHOULD_HAVE_ARRIVED = new Set(["RECEIVED", "COMPLETED"]);

export function getSubStatusBadges(
  status: string,
  sub?: SubStatus,
): SubStatusBadge[] {
  if (!sub || NO_OBLIGATION.has(status)) return [];
  const badges: SubStatusBadge[] = [];
  const payment = PAYMENT[sub.payment];
  if (payment) badges.push(payment);

  const { state, arrived, ordered, registered } = sub.arrival;
  const counts = `${arrived.toLocaleString()}/${ordered.toLocaleString()}`;
  if (state === "FULL") {
    badges.push({ key: "arrival", label: "已到货", tone: "success" });
  } else if (!registered && SHOULD_HAVE_ARRIVED.has(status)) {
    badges.push({
      key: "arrival",
      label: `到货未登记 ${counts}`,
      tone: "danger",
    });
  } else if (state === "PARTIAL") {
    badges.push({
      key: "arrival",
      label: `部分到货 ${counts}`,
      tone: "warning",
    });
  } else {
    badges.push({ key: "arrival", label: `未到货 ${counts}`, tone: "warning" });
  }

  if (!sub.docsComplete) {
    badges.push({ key: "docs", label: "生产资料未齐", tone: "warning" });
  }
  return badges;
}

export function PurchaseSubStatus({
  status,
  subStatus,
}: {
  status: string;
  subStatus?: SubStatus;
}) {
  const badges = getSubStatusBadges(status, subStatus);
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" data-testid="purchase-sub-status">
      {badges.map((badge) => (
        <SemanticBadge key={badge.key} tone={badge.tone}>
          {badge.label}
        </SemanticBadge>
      ))}
    </span>
  );
}
