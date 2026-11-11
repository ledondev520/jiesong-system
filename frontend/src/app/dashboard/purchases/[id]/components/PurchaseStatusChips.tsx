/**
 * Input: 合同状态 status 与后端派生的 subStatus（付款/到货/生产资料）
 * Output: 四个维度各自带标签的 chips：合同 · 付款 · 到货 · 资料，不再混在一行里不知道说的是哪一维
 * Pos: 采购合同详情页头部下方；复用 getSubStatusBadges 的口径与色调，草稿/已取消没有付款到货义务，只显示合同
 */

import { getSubStatusBadges } from "@/components/purchase/PurchaseSubStatus";
import { SemanticBadge, StatusBadge } from "@/components/ui/status-badge";
import type { PurchaseSubStatus } from "@/types";

const DIMENSION_LABELS: Record<string, string> = {
  payment: "付款",
  arrival: "到货",
  docs: "资料",
};

function Dimension({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      {children}
    </li>
  );
}

export function PurchaseStatusChips({
  status,
  subStatus,
}: {
  status: string;
  subStatus?: PurchaseSubStatus;
}) {
  const badges = getSubStatusBadges(status, subStatus);
  // 有付款/到货义务时，资料齐全也要明确说「已齐」，而不是只在缺失时才出现
  const showDocsComplete =
    badges.length > 0 && !badges.some((badge) => badge.key === "docs");

  return (
    <ul
      aria-label="合同状态维度"
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      <Dimension label="合同">
        <StatusBadge domain="purchaseContract" status={status} />
      </Dimension>
      {badges.map((badge) => (
        <Dimension
          key={badge.key}
          label={DIMENSION_LABELS[badge.key] ?? badge.key}
        >
          <SemanticBadge tone={badge.tone} title={badge.title}>
            {badge.label}
          </SemanticBadge>
        </Dimension>
      ))}
      {showDocsComplete && (
        <Dimension label="资料">
          <SemanticBadge tone="success">生产资料已齐</SemanticBadge>
        </Dimension>
      )}
    </ul>
  );
}
