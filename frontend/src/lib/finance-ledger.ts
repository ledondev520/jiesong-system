/**
 * Input: 应收/应付行的待结金额、对账汇总、发票统计、银行流水文本
 * Output: 尾差判定、对账匹配率、负数发票张数、结汇/内部划转标签（纯函数，只做展示判断）
 * Pos: 财务应收/应付/对账/发票/银行流水页共用；不写任何数据（尾差不做核销，见 UX 计划 E3）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

/** 待结金额不超过 1 个币种单位的残额按「尾差」标注，仅提示，不核销。 */
export const RESIDUAL_LIMIT = 1;

export function isResidual(open: number): boolean {
  return open > 0.005 && open <= RESIDUAL_LIMIT;
}

/** 匹配率低于该值时对账页给出琥珀提示。 */
export const MATCH_RATE_ALERT = 0.5;

export interface MatchRate {
  matched: number;
  total: number;
  rate: number;
  low: boolean;
}

/** 以付款对方（供应商）计：已匹配发票的家数 / （已匹配 + 无票付款对方）。没有任何付款对方时不告警。 */
export function matchRate(summary: {
  matchedCount: number;
  unmatchedPaymentCount: number;
}): MatchRate {
  const total = summary.matchedCount + summary.unmatchedPaymentCount;
  const rate = total > 0 ? summary.matchedCount / total : 1;
  return { matched: summary.matchedCount, total, rate, low: rate < MATCH_RATE_ALERT };
}

/** 总数 = 有效 + 已红冲 + 负数/其他；后端未单独返回负数张数，这里由差值得出。 */
export function negativeInvoiceCount(stats: {
  totalCount: number;
  validCount: number;
  reversedCount: number;
}): number {
  return Math.max(stats.totalCount - stats.validCount - stats.reversedCount, 0);
}

export type TxnKind = "结汇" | "内部划转" | null;

/** 按交易类型/摘要文字识别；识别不到返回 null，不猜。 */
export function txnKind(txn: {
  txnType?: string | null;
  summary?: string | null;
}): TxnKind {
  const text = `${txn.txnType ?? ""} ${txn.summary ?? ""}`;
  if (text.includes("结汇")) return "结汇";
  if (/内部|划转|调拨/.test(text)) return "内部划转";
  return null;
}
