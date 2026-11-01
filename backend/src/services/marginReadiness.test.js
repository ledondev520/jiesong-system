/**
 * Input: 合成出口合同与 buildSalesFinanceSummary 结果
 * Output: 每笔合同毛利/净现金不可用的具体原因，以及按原因的笔数合计
 * Pos: marginReadiness 单元测试（不连接数据库）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSalesFinanceSummary } = require('./salesFinanceService');
const { marginBlockers, cashOnlyBlockers, tallyReasons } = require('./marginReadiness');

const owned = (extra = {}) => ({ id: 'i1', isOwnedByJiesong: true, purchaseContractNo: 'PO1', purchaseCost: 70, totalPrice: 100, quantity: 1, ...extra });
const contract = (extra = {}) => ({
  id: 'c', contractNo: 'EXP1', totalAmount: 100, receivedAmount: 0, exchangeRate: 7, payments: [], taxRefunds: [], packingItems: [owned()], ...extra,
});
const explain = (c) => {
  const summary = buildSalesFinanceSummary({ salesContract: c, purchases: [{ id: 'p', contractNo: 'PO1', totalAmount: 70, paidAmount: 0 }] });
  return { summary, blockers: marginBlockers(c, summary) };
};

test('可用的合同没有阻塞原因', () => {
  assert.deepEqual(explain(contract()).blockers, []);
});

test('缺汇率：汇率为 0 时点名「缺汇率」', () => {
  const { blockers } = explain(contract({ exchangeRate: 0 }));
  assert.deepEqual(blockers.map((b) => b.code), ['MISSING_EXCHANGE_RATE']);
  assert.equal(blockers[0].label, '缺汇率');
});

test('缺已售成本：说明缺几条、几条已关联采购合同', () => {
  const { blockers } = explain(contract({ packingItems: [owned({ purchaseCost: null }), owned({ id: 'i2', purchaseContractNo: '', purchaseCost: null })] }));
  assert.deepEqual(blockers.map((b) => b.code), ['MISSING_PURCHASE_COST']);
  assert.match(blockers[0].message, /2\/2 条自有明细未填成本；1 条已关联采购合同，1 条未关联/);
});

test('缺装箱明细是单独原因；同时缺汇率的合同有两个原因', () => {
  assert.deepEqual(explain(contract({ packingItems: [] })).blockers.map((b) => b.code), ['MISSING_PACKING_ITEMS']);
  const both = explain(contract({ exchangeRate: 0, packingItems: [owned({ purchaseCost: null })] })).blockers.map((b) => b.code);
  assert.deepEqual(both.sort(), ['MISSING_EXCHANGE_RATE', 'MISSING_PURCHASE_COST']);
});

test('第三方拼柜不是阻塞原因', () => {
  const { blockers } = explain(contract({ packingItems: [owned({ isOwnedByJiesong: false, purchaseCost: 0 })] }));
  assert.deepEqual(blockers, []);
});

test('净现金额外原因：非美元收款、成本未关联采购合同', () => {
  const nonUsd = contract({ payments: [{ type: 'RECEIVABLE', currency: 'CNY', amount: 10 }] });
  const unlinked = contract({ packingItems: [owned({ purchaseContractNo: '' })] });
  const purchases = [{ id: 'p', contractNo: 'PO1', totalAmount: 70, paidAmount: 0 }];
  const codes = (c) => cashOnlyBlockers(buildSalesFinanceSummary({ salesContract: c, purchases })).map((b) => b.code);
  assert.deepEqual(codes(nonUsd), ['UNSUPPORTED_RECEIPT_CURRENCY']);
  assert.deepEqual(codes(unlinked), ['MISSING_PURCHASE_LINK']);
});

test('按原因合计：一笔缺多项时每项各计一笔，按笔数降序', () => {
  const lists = [
    [{ code: 'MISSING_PURCHASE_COST', label: '缺已售成本' }, { code: 'MISSING_EXCHANGE_RATE', label: '缺汇率' }],
    [{ code: 'MISSING_PURCHASE_COST', label: '缺已售成本' }],
    [{ code: 'MISSING_PURCHASE_COST', label: '缺已售成本' }, { code: 'MISSING_PURCHASE_COST', label: '缺已售成本' }],
  ];
  assert.deepEqual(tallyReasons(lists), [
    { code: 'MISSING_PURCHASE_COST', label: '缺已售成本', count: 3 },
    { code: 'MISSING_EXCHANGE_RATE', label: '缺汇率', count: 1 },
  ]);
});
