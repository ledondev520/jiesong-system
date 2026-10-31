/**
 * Input: Quote objects returned by /api/v1/quotes
 * Output: status labels/tones, the one primary action per status, and line math for the editor
 * Pos: pure helpers shared by the quote list, detail and editor (docs/redesign/UX-REDESIGN-2026.md §6.3)
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "CONVERTED",
  "CANCELLED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "草稿",
  SENT: "已发送",
  ACCEPTED: "客户已接受",
  REJECTED: "已拒绝",
  CONVERTED: "已转订单",
  CANCELLED: "已作废",
};

export const QUOTE_STATUS_TONE: Record<
  QuoteStatus,
  "neutral" | "info" | "success" | "danger" | "secondary"
> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  CONVERTED: "success",
  CANCELLED: "secondary",
};

/** 主按钮按状态唯一：DRAFT 标记已发送、SENT 客户已接受、ACCEPTED 转为出口订单、CONVERTED 查看订单。 */
export type QuotePrimaryAction =
  | { kind: "transition"; to: QuoteStatus; label: string }
  | { kind: "viewOrder"; label: string }
  | null;

export const primaryActionFor = (status: QuoteStatus): QuotePrimaryAction => {
  switch (status) {
    case "DRAFT":
      return { kind: "transition", to: "SENT", label: "标记已发送" };
    case "SENT":
      return { kind: "transition", to: "ACCEPTED", label: "客户已接受" };
    case "ACCEPTED":
      return { kind: "transition", to: "CONVERTED", label: "转为出口订单" };
    case "CONVERTED":
      return { kind: "viewOrder", label: "查看订单" };
    default:
      return null;
  }
};

/** 次要动作（与后端状态机一致）：SENT 可重开编辑或拒绝；DRAFT/SENT/ACCEPTED 可作废。 */
export const secondaryTransitionsFor = (
  status: QuoteStatus,
): { to: QuoteStatus; label: string }[] => {
  const out: { to: QuoteStatus; label: string }[] = [];
  if (status === "SENT")
    out.push(
      { to: "DRAFT", label: "重新编辑" },
      { to: "REJECTED", label: "客户已拒绝" },
    );
  if (status === "DRAFT" || status === "SENT" || status === "ACCEPTED")
    out.push({ to: "CANCELLED", label: "作废" });
  return out;
};

export const isQuoteStatus = (value: unknown): value is QuoteStatus =>
  typeof value === "string" &&
  (QUOTE_STATUSES as readonly string[]).includes(value);

import {
  effectivePrice,
  isManualPrice,
  type OrderLine,
} from "@/lib/order-lines";

const num = (value: string) => {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
};

/**
 * 编辑器行（与 J18 订单网格共用 OrderLine）→ 后端 items。formulaPrice 永不发送（服务端按唯一规则重算）；
 * 填了人工价才发送 unitPrice + isManualPrice（任意 >= 0 的值，负责人 2026-10-31 决定，不与规则价比较）。
 */
export const toItemsPayload = (lines: OrderLine[]) =>
  lines.map((line) => {
    const manual = num(line.manualPrice);
    return {
      productId: line.productId,
      storeId: line.storeId || null,
      quantity: Number(line.quantity),
      unit: line.unit || undefined,
      costCny: num(line.costCny),
      ...(isManualPrice(line) && manual !== null
        ? { isManualPrice: true, unitPrice: manual }
        : {}),
    };
  });

/** 提交前的行级校验，返回第一条中文错误；成本可空（缺成本草稿），后端仍是权威。 */
export const validateLines = (lines: OrderLine[]): string | null => {
  if (lines.length === 0) return "请至少添加一行商品";
  for (const [index, line] of lines.entries()) {
    const row = `第 ${index + 1} 行`;
    if (!line.productId) return `${row}：请选择商品`;
    const quantity = num(line.quantity);
    if (quantity === null || quantity <= 0) return `${row}：数量必须大于 0`;
    const cost = num(line.costCny);
    if (line.costCny.trim() !== "" && (cost === null || cost <= 0))
      return `${row}：成本必须大于 0`;
    const manual = num(line.manualPrice);
    if (isManualPrice(line) && (manual === null || manual < 0))
      return `${row}：手动单价无效`;
  }
  return null;
};

/** 汇率文本 → 数字；空 = 用系统配置现汇。 */
export const parseSpotRate = (text: string): number | null | "invalid" => {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : "invalid";
};

export const formatUsd = (value: number) =>
  `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ItemLike = {
  productId: string;
  storeId: string | null;
  quantity: number;
  unit: string | null;
  costCny: number | null;
  isManualPrice: boolean;
  unitPrice: number;
  formulaPrice: number | null;
  product?: { customsName: string } | null;
};

/** 已保存明细 → 订单网格行：非手动行的 suggested 取已存单价（可能是上次确认价），手动行取规则价（缺成本为 null）；手动价回填 manualPrice。 */
export const linesFromItems = (items: ItemLike[] = []): OrderLine[] =>
  items.map((item, index) => ({
    key: `saved-${index}`,
    productId: item.productId,
    productName: item.product?.customsName ?? "",
    unit: item.unit ?? "",
    storeId: item.storeId ?? "",
    quantity: String(item.quantity),
    costCny: item.costCny === null ? "" : String(item.costCny),
    suggested:
      !item.isManualPrice && item.unitPrice > 0
        ? item.unitPrice
        : item.formulaPrice,
    manualPrice: item.isManualPrice ? String(item.unitPrice) : "",
  }));

/** 当前行的有效单价（人工价优先），用于合计预览。 */
export const previewUnitPrice = effectivePrice;
