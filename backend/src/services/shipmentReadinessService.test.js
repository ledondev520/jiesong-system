/**
 * Input: 40HQ 汇总指标与装箱明细（柜型来自 config/containers.json）
 * Output: 商业利用率、安全上限与物理可装载性的统一判定
 * Pos: 出货门槛契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkUtilisation,
  evaluateLoadingCheck,
  evaluateShipmentReadiness,
} = require('./shipmentReadinessService');
const { getContainerSpec } = require('./containerSpecs');

const spec = getContainerSpec();
const fitItem = {
  id: 'pk-1',
  boxes: 1,
  quantity: 1,
  grossWeight: 1000,
  volume: 60,
  length: 1000,
  width: 1000,
  height: 1000,
  product: { customsName: '可装货物' },
};
const readiness = (overrides = {}) => evaluateShipmentReadiness({ packingItems: [{ ...fitItem, ...overrides }] });
const codes = (result) => result.check.blockers.map((blocker) => blocker.code);

test('默认柜型是 40HQ，限值取自配置', () => {
  assert.equal(spec.code, '40HQ');
  assert.equal(readiness().check.containerType, '40HQ');
});

test('商业利用率达标且全部箱件可装下时允许出货', () => {
  const result = readiness();
  assert.equal(result.utilizationReady, true);
  assert.equal(result.physicalFit, true);
  assert.equal(result.ready, true);
  assert.equal(result.check.status, 'ready');
  assert.match(result.check.headline, /^可出柜：体积 88\.2%、毛重 4\.5%，全部 1 箱已装入 1 个40HQ$/);
});

test('利用率边界按未取整数值比较：79.9 与 79.95 不达标，80 与 100 达标', () => {
  const at = (grossKg) => checkUtilisation({ grossKg, cargoCbm: 0 }, spec);
  assert.equal(at(spec.safeGrossKg * 0.799).utilisationReady, false);
  assert.equal(at(spec.safeGrossKg * 0.7995).utilisationReady, false);
  assert.equal(at(spec.safeGrossKg * 0.8).utilisationReady, true);
  assert.equal(at(spec.safeGrossKg).utilisationReady, true);
  assert.deepEqual(at(spec.safeGrossKg).overReasons, []);
  assert.deepEqual(at(spec.safeGrossKg * 1.001).overReasons, ['weight']);
  assert.equal(at(spec.safeGrossKg * 0.8).reachedBy, 'weight');
  const volume = checkUtilisation({ grossKg: 0, cargoCbm: spec.safeVolumeCbm * 1.001 }, spec);
  assert.deepEqual(volume.overReasons, ['volume']);
  assert.equal(volume.reachedBy, 'volume');
});

test('79.95% 的完整检查不放行，且提示文案不会写成 80.0%', () => {
  const result = readiness({ volume: spec.safeVolumeCbm * 0.7995, grossWeight: 0 });
  assert.equal(result.ready, false);
  assert.equal(result.check.status, 'under-utilised');
  assert.equal(result.check.headline, '未达出柜标准：体积 79.9%、毛重 0.0%，任一需达到 80%');
});

test('体积恰好 80% 即放行，恰好 100% 仍在上限内，100.1% 超体积', () => {
  assert.equal(readiness({ volume: spec.safeVolumeCbm * 0.8, grossWeight: 0 }).ready, true);
  assert.equal(readiness({ volume: spec.safeVolumeCbm, grossWeight: 0 }).ready, true);
  const over = readiness({ volume: spec.safeVolumeCbm * 1.001, grossWeight: 0 });
  assert.equal(over.ready, false);
  assert.deepEqual(codes(over), ['over-volume']);
  assert.match(over.check.headline, /^超体积：68\.1 CBM，超过40HQ安全上限 68 CBM$/);
});

test('毛重 80%（17600 kg）而体积很低也放行，reachedBy 为 weight', () => {
  const result = readiness({ grossWeight: 17600, volume: 1 });
  assert.equal(result.ready, true);
  assert.equal(result.check.reachedBy, 'weight');
});

test('超过重量上限时不得因达到80%而放行，即使体积也达标', () => {
  const result = readiness({ grossWeight: 22001, volume: 63.3 });
  assert.equal(result.overloaded, true);
  assert.deepEqual(result.overloadReasons, ['weight']);
  assert.equal(result.ready, false);
  assert.equal(result.check.status, 'blocked');
  assert.equal(result.check.headline, '超重：毛重 22001 kg，超过40HQ安全上限 22000 kg');
});

test('存在无法装入的箱件时不得放行', () => {
  const result = readiness({ length: 13000 });
  assert.equal(result.unplacedBoxCount, 1);
  assert.equal(result.physicalFit, false);
  assert.equal(result.ready, false);
  assert.deepEqual(codes(result), ['oversize']);
  assert.equal(result.check.headline, '可装货物 箱规 13000×1000×1000 mm 超过40HQ内尺寸，无法装入');
});

test('尺寸合格但空间不足时提示装不下与所需柜数', () => {
  // 每箱 2000×2000×2000 mm，12 箱超过 40HQ 实际可容纳数，但总量仍低于上限。
  const result = readiness({ boxes: 12, length: 2000, width: 2000, height: 2000, volume: 60 });
  assert.ok(result.unplacedBoxCount > 0);
  assert.ok(codes(result).includes('unplaced'));
  assert.match(result.check.blockers.find((item) => item.code === 'unplaced').message,
    new RegExp(`^仍有 ${result.unplacedBoxCount} 箱装不下，共需 2 个40HQ，请拆分订单或更换柜型$`));
});

test('缺少装箱明细或箱数时不得放行', () => {
  const empty = evaluateShipmentReadiness({ packingItems: [] });
  const missingBoxes = readiness({ boxes: null });

  assert.equal(empty.ready, false);
  assert.ok(empty.blockers.includes('missing-packing-items'));
  assert.equal(empty.check.headline, '尚未录入装箱明细');
  assert.equal(missingBoxes.ready, false);
  assert.ok(missingBoxes.blockers.includes('missing-box-count'));
  assert.equal(missingBoxes.check.headline, '1 行装箱明细未填写箱数');
});

test('既无箱规也无体积的行返回 missing-dimensions，不再伪造 500×400×300 的箱子', () => {
  const result = readiness({ length: null, width: null, height: null, volume: null, product: { customsName: '无规格货物' } });
  assert.equal(result.ready, false);
  assert.ok(codes(result).includes('missing-dimensions'));
  assert.equal(result.check.headline, '无规格货物 缺少箱规和体积，无法排柜，请补充箱规（长×宽×高）');
  assert.equal(result.placedBoxCount, 0);
  assert.equal(result.physicalFit, false);
});

test('只有体积的行按体积÷箱数估算，仅提示「估算」不阻塞', () => {
  const result = readiness({ length: null, width: null, height: null, boxes: 10, volume: 6, grossWeight: 17600 });
  assert.equal(result.ready, true);
  assert.equal(result.estimatedDimensionCount, 10);
  assert.equal(result.check.warnings[0].code, 'estimated');
  assert.match(result.check.warnings[0].message, /^1 行箱规为估算/);
});

test('历史数据只做利用率判定时不排柜，也不因箱规缺失阻塞', () => {
  // 真实超长箱（13000mm > 柜长）：排柜会阻塞，utilisationOnly 必须跳过排柜才放行
  const contract = { packingItems: [{ ...fitItem, length: 13000, width: 1000, height: 1000 }] };
  const blocked = evaluateShipmentReadiness(contract);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.unplacedBoxCount, 1);
  const result = evaluateShipmentReadiness(contract, { utilisationOnly: true });
  assert.equal(result.unplacedBoxCount, 0);
  assert.equal(result.ready, true);
});

test('evaluateLoadingCheck: 未知柜型被拒绝，指定 20GP 时按其限值判定', () => {
  assert.throws(() => evaluateShipmentReadiness({ packingItems: [] }, { containerType: '45HQ' }), { statusCode: 400 });
  const twenty = evaluateShipmentReadiness({ packingItems: [fitItem] }, { containerType: '20GP' });
  assert.equal(twenty.check.containerType, '20GP');
  assert.equal(codes(twenty).includes('over-volume'), true);
});

test('evaluateLoadingCheck: 任一阻塞时 status 为 blocked，仅未达标时为 under-utilised', () => {
  const plan = { spec, totals: { cartons: 1, grossKg: 100, cargoCbm: 1 }, lines: [], unplaced: [] };
  const low = evaluateLoadingCheck(plan, { packingLineCount: 1, linesMissingBoxes: 0 });
  assert.equal(low.status, 'under-utilised');
  const blocked = evaluateLoadingCheck(plan, { packingLineCount: 1, linesMissingBoxes: 2 });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.headline, '2 行装箱明细未填写箱数');
});
