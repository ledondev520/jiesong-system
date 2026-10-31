/**
 * Input: Quote objects returned by /api/v1/quotes
 * Output: status labels/tones, the one primary action per status, and line math for the editor
 * Pos: pure helpers shared by the quote list, detail and editor (docs/redesign/UX-REDESIGN-2026.md §6.3)
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "CONVERTED", "CANCELLED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "草稿",
  SENT: "已发送",
  ACCEPTED: "客户已接受",
  REJECTED: "已拒绝",
  CONVERTED: "已转订单",
  CANCELLED: "已作废",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, "neutral" | "info" | "success" | "danger" | "secondary"> = {
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
    case "DRAFT": return { kind: "transition", to: "SENT", label: "标记已发送" };
    case "SENT": return { kind: "transition", to: "ACCEPTED", label: "客户已接受" };
    case "ACCEPTED": return { kind: "transition", to: "CONVERTED", label: "转为出口订单" };
    case "CONVERTED": return { kind: "viewOrder", label: "查看订单" };
    default: return null;
  }
};

/** 次要动作（与后端状态机一致）：SENT 可重开编辑或拒绝；DRAFT/SENT/ACCEPTED 可作废。 */
export const secondaryTransitionsFor = (status: QuoteStatus): { to: QuoteStatus; label: string }[] => {
  const out: { to: QuoteStatus; label: string }[] = [];
  if (status === "SENT") out.push({ to: "DRAFT", label: "重新编辑" }, { to: "REJECTED", label: "客户已拒绝" });
  if (status === "DRAFT" || status === "SENT" || status === "ACCEPTED") out.push({ to: "CANCELLED", label: "作废" });
  return out;
};

export const isQuoteStatus = (value: unknown): value is QuoteStatus =>
  typeof value === "string" && (QUOTE_STATUSES as readonly string[]).includes(value);

export interface QuoteLineDraft {
  key: string;
  productId: string;
  storeId: string;
  quantity: string;
  costCny: string;
  /** 空 = 按规则出价；填写 = 手动价（isManualPrice） */
  manualPrice: string;
  unit?: string;
  note?: string;
  /** 仅展示：上次保存时服务端算出的规则价/最终单价（不会随请求发送） */
  formulaPrice?: number | null;
  serverUnitPrice?: number;
}

const num = (value: string) => {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
};

/** 编辑器 → 后端 items；formulaPrice 永不发送（服务端按唯一规则重算）。 */
export const toItemsPayload = (lines: QuoteLineDraft[]) =>
  lines.map((line) => {
    const manual = num(line.manualPrice);
    return {
      productId: line.productId,
      storeId: line.storeId || null,
      quantity: Number(line.quantity),
      unit: line.unit || undefined,
      note: line.note || undefined,
      costCny: num(line.costCny),
      ...(manual !== null ? { isManualPrice: true, unitPrice: manual } : {}),
    };
  });

/** 提交前的行级校验，返回第一条中文错误；与后端 400 规则保持一致，但后端仍是权威。 */
export const validateLines = (lines: QuoteLineDraft[]): string | null => {
  for (const [index, line] of lines.entries()) {
    const row = `第${index + 1}行`;
    if (!line.productId) return `${row}请选择商品`;
    const quantity = num(line.quantity);
    if (quantity === null || quantity <= 0) return `${row}数量必须大于0`;
    const cost = num(line.costCny);
    if (line.costCny.trim() !== "" && (cost === null || cost <= 0)) return `${row}成本必须大于0`;
    const manual = num(line.manualPrice);
    if (line.manualPrice.trim() !== "" && (manual === null || manual < 0)) return `${row}手动单价无效`;
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
  productId: string; storeId: string | null; quantity: number; unit: string | null; note: string | null;
  costCny: number | null; isManualPrice: boolean; unitPrice: number; formulaPrice: number | null;
};

/** 已保存明细 → 编辑器行（手动价回填为 manualPrice，其余为空表示按规则）。 */
export const linesFromItems = (items: ItemLike[] = []): QuoteLineDraft[] =>
  items.map((item, index) => ({
    key: `saved-${index}`,
    productId: item.productId,
    storeId: item.storeId ?? "",
    quantity: String(item.quantity),
    costCny: item.costCny === null ? "" : String(item.costCny),
    manualPrice: item.isManualPrice ? String(item.unitPrice) : "",
    unit: item.unit ?? undefined,
    note: item.note ?? undefined,
    formulaPrice: item.formulaPrice,
    serverUnitPrice: item.unitPrice,
  }));
