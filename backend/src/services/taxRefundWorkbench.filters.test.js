/**
 * Input: 桩化的出货准备列表（45 条，跨月份与阻塞原因）
 * Output: A82 月份范围（含历史待办）与原因筛选在分页之前于服务端生效的回归
 * Pos: 退税工作台服务测试
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shipmentService = require('./taxRefundShipmentService');
const { getTaxRefundWorkbench } = require('./taxRefundWorkbenchService');
const { blockerReasons, LABEL_ORDER } = require('./taxRefundBlockerGroups');

// 申报月份 2026-11：本期 = 2026-10 出货；2026-08 出货为历史待办。
const FILING_MONTH = '2026-11';
const preparations = Array.from({ length: 45 }, (_, i) => ({
  shipmentKey: `k${i}`,
  salesContractId: `s${i}`,
  contractNo: `EXP-${String(i).padStart(3, '0')}`,
  shippedAt: i % 3 === 0 ? '2026-10-15T04:00:00.000Z' : '2026-08-15T04:00:00.000Z',
  contractStatus: 'SHIPPED',
  customsDeclarationId: null,
  invoiceLinks: [],
  invoiceVerification: { summary: { review: 0, missing: 0 } },
  materialReady: false,
  confirmationStatus: 'PENDING',
  confirmedFile: null,
  materialBlockers: i % 2 === 0 ? ['发票未命中台账'] : ['缺少出货日期'],
}));
const isOct = (i) => i % 3 === 0;
const isInvoice = (i) => i % 2 === 0;
const range = (predicate) => preparations.map((_, i) => i).filter(predicate);

const run = async (t, query) => {
  const original = shipmentService.listShipmentPreparations;
  shipmentService.listShipmentPreparations = async () => preparations;
  t.after(() => { shipmentService.listShipmentPreparations = original; });
  return getTaxRefundWorkbench({ filingMonth: FILING_MONTH, ...query }, {});
};
const nos = (result) => result.items.map((item) => item.contractNo);
const expectedNos = (indexes) => indexes.map((i) => preparations[i].contractNo);

test('无筛选：45 条历史+本期，分页 20/20/5', async (t) => {
  assert.equal((await run(t, {})).total, 45);
  assert.equal((await run(t, { page: 3 })).items.length, 5);
});

test('includeHistory=false：筛选先于分页，跨页只剩本期出货', async (t) => {
  const octs = range(isOct); // 15
  const page1 = await run(t, { includeHistory: 'false', pageSize: 10 });
  const page2 = await run(t, { includeHistory: 'false', pageSize: 10, page: 2 });
  assert.equal(page1.total, octs.length);
  assert.deepEqual([...nos(page1), ...nos(page2)], expectedNos(octs));
  assert.equal(page1.facets.historyCount, 30);
});

test('reason：筛选先于分页，第 2 页仍全部命中该原因，合计为全量匹配数', async (t) => {
  const matching = range(isInvoice); // 23
  const page1 = await run(t, { reason: '发票核验', pageSize: 10 });
  const page2 = await run(t, { reason: '发票核验', pageSize: 10, page: 2 });
  const page3 = await run(t, { reason: '发票核验', pageSize: 10, page: 3 });
  assert.equal(page1.total, matching.length);
  assert.deepEqual([...nos(page1), ...nos(page2), ...nos(page3)], expectedNos(matching));
  for (const item of [...page1.items, ...page2.items]) assert.ok(blockerReasons(item.issues).includes('发票核验'));
});

test('月份范围与原因组合：只剩本期且命中原因的出货，facets 不受原因影响', async (t) => {
  const both = range((i) => isOct(i) && isInvoice(i)); // 8
  const result = await run(t, { includeHistory: 'false', reason: '发票核验', pageSize: 5 });
  const second = await run(t, { includeHistory: 'false', reason: '发票核验', pageSize: 5, page: 2 });
  assert.equal(result.total, both.length);
  assert.deepEqual([...nos(result), ...nos(second)], expectedNos(both));
  assert.deepEqual(result.facets.reasons, [
    { label: '发票核验', count: both.length },
    { label: '出货与装箱', count: range((i) => isOct(i) && !isInvoice(i)).length },
  ]);
  assert.equal(result.facets.scopeTotal, 15);
});

test('reason 全部/未知与非法 includeHistory', async (t) => {
  assert.equal((await run(t, { reason: 'ALL' })).total, 45);
  assert.equal((await run(t, { reason: '不存在的类型' })).total, 0);
  await assert.rejects(run(t, { includeHistory: 'maybe' }), { statusCode: 400 });
});

test('服务端阻塞原因规则与前端 BlockerGroups 的 GROUP_RULES 一致', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/components/tax-refund/BlockerGroups.tsx'), 'utf8');
  assert.deepEqual(LABEL_ORDER.slice(0, -1).length, 6);
  const rules = [...source.matchAll(/\{ label: "([^"]+)", test: \/(.+)\/ \}/g)].map((m) => [m[1], m[2]]);
  assert.equal(rules.length, 6);
  const probes = { 报关单: '缺少报关', 供应商资料: '供应商税号不完整', 退税计算: '退税率缺失', 发票核验: '发票号码异常', 出货与装箱: '缺少出货日期', 商品与报关要素: '缺HS编码' };
  for (const [label, source_] of rules) {
    assert.ok(LABEL_ORDER.includes(label), label);
    assert.deepEqual(blockerReasons([probes[label]]).slice(0, 1).length, 1);
    assert.ok(new RegExp(source_).test(probes[label]), `${label} regex`);
  }
  assert.deepEqual(blockerReasons(['无法归类的文案；缺少出货日期；缺少出货日期']), ['出货与装箱', '其他']);
});
