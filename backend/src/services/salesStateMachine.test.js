/**
 * Input: 出口合同状态值（含历史别名）
 * Output: 规范状态与单向流转校验结果
 * Pos: 出口合同状态契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SALES_STATUS,
  normalizeSalesStatus,
  validateSalesTransition,
} = require('./salesStateMachine');

test('出口状态按确认、装柜、发运、到港、完成顺序推进', () => {
  const path = [
    SALES_STATUS.DRAFT,
    SALES_STATUS.CONFIRMED,
    SALES_STATUS.PACKING,
    SALES_STATUS.SHIPPED,
    SALES_STATUS.ARRIVED,
    SALES_STATUS.COMPLETED,
  ];

  for (let index = 0; index < path.length - 1; index += 1) {
    assert.deepEqual(validateSalesTransition(path[index], path[index + 1]), { valid: true });
  }
});

test('出口状态拒绝未装柜直接发运', () => {
  const result = validateSalesTransition(SALES_STATUS.CONFIRMED, SALES_STATUS.SHIPPED);

  assert.equal(result.valid, false);
  assert.match(result.message, /非法状态流转/);
});

test('出口状态兼容旧值但统一写入规范状态', () => {
  assert.equal(normalizeSalesStatus('pending_shipment'), SALES_STATUS.PACKING);
  assert.equal(normalizeSalesStatus('OUT_STOCK'), SALES_STATUS.SHIPPED);
  assert.equal(normalizeSalesStatus('paid'), SALES_STATUS.COMPLETED);
});

test('仅发运前的出口合同允许取消', () => {
  assert.deepEqual(
    validateSalesTransition(SALES_STATUS.PACKING, SALES_STATUS.CANCELLED),
    { valid: true },
  );
  assert.equal(validateSalesTransition(SALES_STATUS.SHIPPED, SALES_STATUS.CANCELLED).valid, false);
});
