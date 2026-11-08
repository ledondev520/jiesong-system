/**
 * Input: 退税材料准备的阻塞文案数组
 * Output: 阻塞原因类型标签（去重，顺序同前端 BlockerGroups）
 * Pos: 退税工作台服务端「原因」筛选使用；规则必须与 frontend/src/components/tax-refund/BlockerGroups.tsx 的 GROUP_RULES 保持一致（taxRefundWorkbench.filters.test.js 钉住）
 */

// 顺序即优先级：先报关，再供应商资料，再退税计算，再发票，再出货/装箱，最后商品要素。
const GROUP_RULES = [
  { label: '报关单', test: /报关|放行/ },
  { label: '供应商资料', test: /供应商(?!发票|开票)/ },
  { label: '退税计算', test: /退税|采购含税成本|专票税率/ },
  { label: '发票核验', test: /发票|票号|票种|税号|进项/ },
  { label: '出货与装箱', test: /出货|发运|装箱|采购来源/ },
  { label: '商品与报关要素', test: /HS|税则|申报要素|出口单价|总价/ },
];
const OTHER_LABEL = '其他';
const LABEL_ORDER = [...GROUP_RULES.map((rule) => rule.label), OTHER_LABEL];

const blockerReasons = (blockers = []) => {
  const labels = new Set();
  for (const text of blockers.flatMap((value) => String(value).split('；')).map((value) => value.trim()).filter(Boolean)) {
    const rule = GROUP_RULES.find((candidate) => candidate.test.test(text));
    labels.add(rule ? rule.label : OTHER_LABEL);
  }
  return LABEL_ORDER.filter((label) => labels.has(label));
};

module.exports = { blockerReasons, LABEL_ORDER };
