/**
 * Input: 订单表头、商品 × 门店的明细行、建议单价
 * Output: 行小计/合计/按门店小计，粘贴文本解析，以及 POST /sales 的创建载荷
 * Pos: 订单编辑器的纯逻辑；价格口径只来自服务端预览（整美元后取整到 5 的倍数），这里不重算
 */
import type { SalesCreationPayload } from "@/services/sales.service";

export interface OrderLine {
  key: string;
  productId: string;
  productName: string;
  unit: string;
  storeId: string;
  quantity: string;
  /** 单位采购成本 ¥（文本，便于输入） */
  costCny: string;
  /** 服务端建议单价（美元）；缺成本时为 null */
  suggested: number | null;
  /** 人工单价；空串 = 采用建议价 */
  manualPrice: string;
}

export interface OrderHeader {
  customerId: string;
  incoterm: string;
  paymentTerms: string;
  portOfLoading: string;
  /** 订单现汇（文本） */
  exchangeRate: string;
}

const positive = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
};

/** 人工价优先；无效的人工价不静默回退到建议价（返回 null，由校验提示） */
export const effectivePrice = (line: OrderLine): number | null =>
  line.manualPrice.trim() !== "" ? positive(line.manualPrice) : line.suggested;

export const isManualPrice = (line: OrderLine) => line.manualPrice.trim() !== "";

export const lineTotal = (line: OrderLine): number => {
  const quantity = positive(line.quantity);
  const price = effectivePrice(line);
  return quantity !== null && price !== null ? Number((quantity * price).toFixed(2)) : 0;
};

export const orderTotal = (lines: OrderLine[]): number =>
  Number(lines.reduce((sum, line) => sum + lineTotal(line), 0).toFixed(2));

export const storeSubtotals = (lines: OrderLine[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.storeId) continue;
    totals.set(line.storeId, Number(((totals.get(line.storeId) ?? 0) + lineTotal(line)).toFixed(2)));
  }
  return totals;
};

/** 返回第一个阻止提交的问题；null 表示可以提交 */
export function validateOrder(header: OrderHeader, lines: OrderLine[]): string | null {
  if (!header.customerId) return "请选择客户";
  if (positive(header.exchangeRate) === null) return "请填写有效的现汇";
  if (lines.length === 0) return "请至少添加一行商品";
  for (const [index, line] of lines.entries()) {
    const row = `第 ${index + 1} 行`;
    if (!line.productId) return `${row}：请选择商品`;
    if (!line.storeId) return `${row}：请选择门店`;
    if (positive(line.quantity) === null) return `${row}：数量必须大于 0`;
    if (positive(line.costCny) === null) return `${row}：请填写采购成本（¥）`;
    if (effectivePrice(line) === null) return `${row}：没有可用单价，请检查成本或填写人工单价`;
  }
  return null;
}

export function buildCreationPayload(header: OrderHeader, lines: OrderLine[]): SalesCreationPayload {
  return {
    customerId: header.customerId,
    currency: "USD",
    incoterm: header.incoterm || undefined,
    paymentTerms: header.paymentTerms.trim() || undefined,
    portOfLoading: header.portOfLoading.trim() || undefined,
    exchangeRate: Number(header.exchangeRate),
    items: lines.map((line) => ({
      productId: line.productId,
      storeId: line.storeId,
      quantity: Number(line.quantity),
      unit: line.unit || undefined,
      costPrice: Number(line.costCny),
      sellingPrice: effectivePrice(line) as number,
    })),
  } as SalesCreationPayload;
}

export interface PastedRow {
  productText: string;
  storeText: string;
  quantity: string;
  costCny: string;
}

/**
 * 解析从 Excel 复制的制表符文本。列顺序：商品、门店、数量、成本(¥，可空)。
 * 表头行（首列含“商品”）自动跳过；空行忽略。
 */
export function parsePastedRows(text: string): PastedRow[] {
  return text
    .split(/\r?\n/)
    .map((raw) => raw.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells, index) => !(index === 0 && /商品|product/i.test(cells[0] ?? "")))
    .map(([productText = "", storeText = "", quantity = "", costCny = ""]) => ({
      productText,
      storeText,
      quantity: quantity.replace(/,/g, ""),
      costCny: costCny.replace(/[¥,\s]/g, ""),
    }));
}

export interface StoreRef {
  id: string;
  name: string;
  code?: string | null;
}
export interface ProductRef {
  id: string;
  customsName: string;
  unit?: string;
}

/** 门店按简称或名称（不区分大小写、整串相等）匹配；商品由调用方查找（服务端搜索），这里只拼装结果 */
export function matchStore(text: string, stores: StoreRef[]): StoreRef | null {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  return (
    stores.find((store) => store.code?.toLowerCase() === needle) ??
    stores.find((store) => store.name.toLowerCase() === needle) ??
    null
  );
}

let sequence = 0;
export const newLineKey = () => `line-${Date.now().toString(36)}-${(sequence += 1)}`;

export const emptyLine = (): OrderLine => ({
  key: newLineKey(),
  productId: "",
  productName: "",
  unit: "",
  storeId: "",
  quantity: "",
  costCny: "",
  suggested: null,
  manualPrice: "",
});

export interface PasteResult {
  lines: OrderLine[];
  problems: string[];
}

/** 把粘贴行转成订单行；匹配不到的商品/门店不产生行并记录问题（不猜测、不新建） */
export async function resolvePastedRows(
  rows: PastedRow[],
  stores: StoreRef[],
  findProduct: (text: string) => Promise<ProductRef | null>,
): Promise<PasteResult> {
  const lines: OrderLine[] = [];
  const problems: string[] = [];
  for (const [index, row] of rows.entries()) {
    const label = `第 ${index + 1} 行`;
    const store = matchStore(row.storeText, stores);
    const product = row.productText ? await findProduct(row.productText) : null;
    if (!product) problems.push(`${label}：找不到商品「${row.productText}」`);
    else if (!store) problems.push(`${label}：该客户下找不到门店「${row.storeText}」`);
    else {
      lines.push({
        ...emptyLine(),
        productId: product.id,
        productName: product.customsName,
        unit: product.unit ?? "",
        storeId: store.id,
        quantity: row.quantity,
        costCny: row.costCny,
      });
    }
  }
  return { lines, problems };
}
