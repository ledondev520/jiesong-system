/**
 * Input: 40HQ 汇总指标与装箱明细
 * Output: 商业利用率、安全上限与物理可装载性的统一判定
 * Pos: 出货门槛契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateShipmentReadiness } = require('./shipmentReadinessService');

const fitItem = {
  id: 'pk-1',
  boxes: 1,
  quantity: 1,
  volume: 60,
  length: 1000,
  width: 1000,
  height: 1000,
  product: { customsName: '可装货物' },
};

test('商业利用率达标且全部箱件可装下时允许出货', () => {
  const result = evaluateShipmentReadiness({
    grossWeight: 1000,
    volume: 60,
    packingItems: [fitItem],
  });

  assert.equal(result.utilizationReady, true);
  assert.equal(result.physicalFit, true);
  assert.equal(result.ready, true);
});

test('超过重量上限时不得因达到80%而放行', () => {
  const result = evaluateShipmentReadiness({
    grossWeight: 22060.3,
    volume: 63.3,
    packingItems: [fitItem],
  });

  assert.equal(result.overloaded, true);
  assert.deepEqual(result.overloadReasons, ['weight']);
  assert.equal(result.ready, false);
});

test('存在无法装入的箱件时不得放行', () => {
  const result = evaluateShipmentReadiness({
    grossWeight: 1000,
    volume: 60,
    packingItems: [{ ...fitItem, length: 13000 }],
  });

  assert.equal(result.unplacedBoxCount, 1);
  assert.equal(result.physicalFit, false);
  assert.equal(result.ready, false);
});

test('缺少装箱明细或箱数时不得放行', () => {
  const empty = evaluateShipmentReadiness({ grossWeight: 17600, volume: 10, packingItems: [] });
  const missingBoxes = evaluateShipmentReadiness({
    grossWeight: 17600,
    volume: 10,
    packingItems: [{ ...fitItem, boxes: 0 }],
  });

  assert.equal(empty.ready, false);
  assert.ok(empty.blockers.includes('missing-packing-items'));
  assert.equal(missingBoxes.ready, false);
  assert.ok(missingBoxes.blockers.includes('missing-box-count'));
});
