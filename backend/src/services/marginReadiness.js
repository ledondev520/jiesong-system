/**
 * Input: 一笔已发运出口合同及其 buildSalesFinanceSummary 结果
 * Output: 该合同毛利/现金流为何不可用（具体缺哪项输入）与按原因的合计
 * Pos: 经营概览共用；只解释 salesFinanceService 已给出的 issue，不重新计算任何金额
 *
 * 口径：毛利不可用 = 缺有效汇率 / 缺自有货物美元金额 / 缺已售成本 / 缺装箱明细。
 *       净现金不可用 = 以上原因，另加非 USD 收款、成本未关联采购合同、采购合同未找到。
 *       一笔合同可同时有多个原因；按原因的合计各自计一笔（原因之和可大于不可用笔数）。
 */

const MARGIN_REASONS = {
  MISSING_EXCHANGE_RATE: '缺汇率',
  MISSING_OWNED_REVENUE: '缺自有货物美元金额',
  MISSING_PURCHASE_COST: '缺已售成本',
  MISSING_PACKING_ITEMS: '缺装箱明细',
};
const CASH_ONLY_REASONS = {
  UNSUPPORTED_RECEIPT_CURRENCY: '含非美元收款',
  MISSING_PURCHASE_LINK: '成本未关联采购合同',
  PURCHASE_CONTRACT_NOT_FOUND: '关联的采购合同未找到',
};

const costDetail = (meta) => {
  if (!meta) return '';
  const unlinked = meta.lineCount - meta.linkedLineCount;
  return `（${meta.lineCount}/${meta.ownedLineCount} 条自有明细未填成本；${meta.linkedLineCount} 条已关联采购合同，${unlinked} 条未关联）`;
};

/** 该合同毛利不可用的具体原因；毛利可用时返回空数组。 */
const marginBlockers = (contract, summary) => {
  const blockers = [];
  if (!contract.packingItems?.length) {
    blockers.push({ code: 'MISSING_PACKING_ITEMS', label: MARGIN_REASONS.MISSING_PACKING_ITEMS, message: '缺少装箱明细，无法匹配已售成本' });
  }
  for (const issue of summary.issues) {
    if (issue.severity === 'error' && MARGIN_REASONS[issue.code]) {
      blockers.push({
        code: issue.code,
        label: MARGIN_REASONS[issue.code],
        message: issue.code === 'MISSING_PURCHASE_COST' ? `缺已售成本${costDetail(issue.meta)}` : issue.message,
      });
    }
  }
  return blockers;
};

/** 该合同净现金不可用的额外原因（不含毛利原因）。 */
const cashOnlyBlockers = (summary) => summary.issues
  .filter((issue) => CASH_ONLY_REASONS[issue.code])
  .map((issue) => ({ code: issue.code, label: CASH_ONLY_REASONS[issue.code], message: issue.message }));

/** 按原因合计笔数：[{ code, label, count }]，笔数降序。 */
const tallyReasons = (blockerLists) => {
  const counts = new Map();
  for (const list of blockerLists) {
    for (const code of new Set(list.map((blocker) => blocker.code))) {
      const first = list.find((blocker) => blocker.code === code);
      const row = counts.get(code) || { code, label: first.label, count: 0 };
      row.count += 1;
      counts.set(code, row);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
};

module.exports = { MARGIN_REASONS, CASH_ONLY_REASONS, marginBlockers, cashOnlyBlockers, tallyReasons };
