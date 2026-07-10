/**
 * Input: 采购合同状态值（含历史别名）
 * Output: 规范状态与单向流转校验结果
 * Pos: 采购合同状态契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PURCHASE_STATUS,
  normalizePurchaseStatus,
  validatePurchaseTransition,
} = require('./purchaseStateMachine');

test('采购状态按签约、生产、发货、收货、完成顺序推进', () => {
  const path = [
    PURCHASE_STATUS.DRAFT,
    PURCHASE_STATUS.SIGNED,
    PURCHASE_STATUS.PRODUCING,
    PURCHASE_STATUS.READY,
    PURCHASE_STATUS.SHIPPED,
    PURCHASE_STATUS.RECEIVED,
    PURCHASE_STATUS.COMPLETED,
  ];

  for (let index = 0; index < path.length - 1; index += 1) {
    assert.deepEqual(validatePurchaseTransition(path[index], path[index + 1]), { valid: true });
  }
});

test('采购状态拒绝跳过生产阶段直接发货', () => {
  const result = validatePurchaseTransition(PURCHASE_STATUS.SIGNED, PURCHASE_STATUS.SHIPPED);

  assert.equal(result.valid, false);
  assert.match(result.message, /非法状态流转/);
});

test('采购生产完成后先进入待装柜状态再允许发货', () => {
  assert.deepEqual(
    validatePurchaseTransition(PURCHASE_STATUS.PRODUCING, PURCHASE_STATUS.READY),
    { valid: true },
  );
  assert.deepEqual(
    validatePurchaseTransition(PURCHASE_STATUS.READY, PURCHASE_STATUS.SHIPPED),
    { valid: true },
  );
});

test('采购状态兼容旧值但统一写入规范状态', () => {
  assert.equal(normalizePurchaseStatus('pending_inspection'), PURCHASE_STATUS.PRODUCING);
  assert.equal(normalizePurchaseStatus('IN_STOCK'), PURCHASE_STATUS.RECEIVED);
});

test('未完成采购合同允许取消，已完成合同不可取消', () => {
  assert.deepEqual(
    validatePurchaseTransition(PURCHASE_STATUS.PRODUCING, PURCHASE_STATUS.CANCELLED),
    { valid: true },
  );
  assert.equal(
    validatePurchaseTransition(PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELLED).valid,
    false,
  );
});
