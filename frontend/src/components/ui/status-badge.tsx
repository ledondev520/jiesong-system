/**
 * Input: 业务状态文本、可选业务对象（domain）、语义色调
 * Output: 统一状态徽章（SemanticBadge 色调 + StatusBadge 状态映射，已合并为本文件）
 * Pos: 前端UI 统一状态层；全部状态到文案与语义色的映射都在此文件（UX 规范 §8.7）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const semanticBadgeVariants = cva("", {
  variants: {
    tone: {
      neutral: "border-border bg-muted text-muted-foreground",
      info: "border-primary/20 bg-primary/10 text-primary",
      warning:
        "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400",
      progress: "border-primary/20 bg-primary/10 text-primary",
      success:
        "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-400",
      danger:
        "border-destructive/30 bg-destructive/10 text-destructive-foreground",
      secondary: "border-border bg-secondary text-secondary-foreground",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

type SemanticBadgeProps = Omit<React.ComponentProps<typeof Badge>, "variant"> &
  VariantProps<typeof semanticBadgeVariants>;

/** 职责：按 tone 渲染统一语义徽章，页面不再自己写状态配色 */
export function SemanticBadge({
  tone,
  className,
  ...props
}: SemanticBadgeProps) {
  return (
    <Badge
      className={cn(semanticBadgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export type StatusBadgeConfig = {
  label: string;
  tone: SemanticBadgeProps["tone"];
};

type StatusMap = Record<string, StatusBadgeConfig>;

const DEFAULT_STATUS_MAP: StatusMap = {
  DRAFT: { label: "草稿", tone: "neutral" },
  SIGNED: { label: "已签订", tone: "info" },
  PENDING: { label: "待装柜", tone: "neutral" },
  CONFIRMED: { label: "已确认", tone: "neutral" },
  PRODUCING: { label: "生产中", tone: "warning" },
  PACKING: { label: "装箱中", tone: "warning" },
  LOADING: { label: "装柜中", tone: "warning" },
  SHIPPING: { label: "运输中", tone: "progress" },
  SHIPPED: { label: "已发运", tone: "progress" },
  INBOUND: { label: "已入库", tone: "secondary" },
  ARRIVED: { label: "已到达", tone: "success" },
  OUTBOUND: { label: "已出库", tone: "success" },
  COMPLETED: { label: "已完成", tone: "secondary" },
  CANCELLED: { label: "已取消", tone: "secondary" },
};

/**
 * 按业务对象的状态表（规范 §8.7）：灰=neutral 蓝=info 绿=success 琥珀=warning。
 * 仅在传入 domain 时使用；不传 domain 时仍走上面的 DEFAULT_STATUS_MAP，保持现有页面显示不变。
 * 键与后端 config/constants.js 一致；QUOTE 的键是规范约定，后端报价表上线时需对齐。
 */
export const DOMAIN_STATUS_MAPS = {
  quote: {
    DRAFT: { label: "草稿", tone: "neutral" },
    SENT: { label: "已发送", tone: "info" },
    ACCEPTED: { label: "已接受", tone: "success" },
    REJECTED: { label: "已拒绝", tone: "neutral" },
    CONVERTED: { label: "已转订单", tone: "success" },
    EXPIRED: { label: "已过期", tone: "warning" },
  },
  salesOrder: {
    DRAFT: { label: "草稿", tone: "neutral" },
    CONFIRMED: { label: "已确认", tone: "info" },
    PACKING: { label: "装柜中", tone: "info" },
    SHIPPED: { label: "已发运", tone: "info" },
    ARRIVED: { label: "已到港", tone: "warning" },
    COMPLETED: { label: "已完成", tone: "success" },
    CANCELLED: { label: "已取消", tone: "neutral" },
  },
  purchaseContract: {
    DRAFT: { label: "草稿", tone: "neutral" },
    SIGNED: { label: "已签订", tone: "info" },
    PRODUCING: { label: "生产中", tone: "info" },
    READY: { label: "待装柜", tone: "warning" },
    SHIPPED: { label: "已发货", tone: "info" },
    RECEIVED: { label: "已收货", tone: "success" },
    COMPLETED: { label: "已完成", tone: "success" },
    CANCELLED: { label: "已取消", tone: "neutral" },
  },
  inventory: {
    PRODUCING: { label: "生产中", tone: "info" },
    PACKING: { label: "包装中", tone: "info" },
    SHIPPING: { label: "运输中", tone: "info" },
    INBOUND: { label: "已入库", tone: "success" },
    OUTBOUND: { label: "已出库", tone: "neutral" },
  },
} as const satisfies Record<string, StatusMap>;

export type StatusDomain = keyof typeof DOMAIN_STATUS_MAPS;

const normalizeStatus = (status: unknown): string =>
  typeof status === "string" ? status.trim().toUpperCase() : "UNKNOWN";

export const getStatusBadgeConfig = (
  status: unknown,
  overrides: StatusMap = {},
  domain?: StatusDomain,
): StatusBadgeConfig => {
  const normalized = normalizeStatus(status);
  if (overrides[normalized]) {
    return overrides[normalized];
  }

  const domainMap: StatusMap | undefined = domain
    ? DOMAIN_STATUS_MAPS[domain]
    : undefined;
  if (domainMap?.[normalized]) {
    return domainMap[normalized];
  }

  if (DEFAULT_STATUS_MAP[normalized]) {
    return DEFAULT_STATUS_MAP[normalized];
  }

  return {
    label: String(status),
    tone: "neutral",
  };
};

export const StatusBadge = ({
  status,
  statusMap,
  domain,
}: {
  status: unknown;
  statusMap?: StatusMap;
  domain?: StatusDomain;
}) => {
  const config = getStatusBadgeConfig(status, statusMap, domain);
  return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
};

export const registerStatusBadgeMap = (statusMap: StatusMap) => statusMap;
