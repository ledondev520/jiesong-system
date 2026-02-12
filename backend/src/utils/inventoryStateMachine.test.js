/**
 * Input: inventoryStateMachine 工具
 * Output: 库存状态机规则测试结果
 * Pos: 后端规则单测，保障库存状态流转约束稳定
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInventoryTransition } = require('./inventoryStateMachine');

test('允许顺序状态流转：PRODUCING -> PACKING', () => {
  const result = validateInventoryTransition('PRODUCING', 'PACKING', {});
  assert.equal(result.valid, true);
});

test('拒绝非法跳转：PRODUCING -> OUTBOUND', () => {
  const result = validateInventoryTransition('PRODUCING', 'OUTBOUND', {});
  assert.equal(result.valid, false);
  assert.match(result.message, /非法状态流转/);
});

test('拒绝 INBOUND -> OUTBOUND（缺少 salesContractId）', () => {
  const result = validateInventoryTransition('INBOUND', 'OUTBOUND', { salesContractId: null });
  assert.equal(result.valid, false);
  assert.match(result.message, /禁止出库/);
});

test('允许 INBOUND -> OUTBOUND（存在 salesContractId）', () => {
  const result = validateInventoryTransition('INBOUND', 'OUTBOUND', { salesContractId: 'sale-1' });
  assert.equal(result.valid, true);
});
