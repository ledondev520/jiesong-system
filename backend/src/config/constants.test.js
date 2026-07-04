/**
 * Input: node:test、node:assert/strict、constants配置
 * Output: 常量定义的单元测试结果
 * Pos: 后端常量配置测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLES,
  PURCHASE_STATUS,
  SALES_STATUS,
  INVENTORY_STATUS,
  CONTAINER_STATUS,
  PAYMENT_TYPE,
  NOTIFICATION_TYPE,
  IMPORT_STATUS,
} = require('./constants');

/**
 * 职责：获取排序后的枚举值数组
 * @param {object} enumObject - 枚举对象
 * @returns {string[]} 排序后的值数组
 */
const getSortedValues = (enumObject) => {
  return Object.values(enumObject).slice().sort();
};

test('ROLES: 包含管理员/采购/销售/财务/仓库角色', () => {
  const values = getSortedValues(ROLES);

  assert.deepStrictEqual(values, ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'].sort());
});

test('INVENTORY_STATUS: 与PRD状态机一致', () => {
  const values = getSortedValues(INVENTORY_STATUS);

  assert.deepStrictEqual(
    values,
    ['PRODUCING', 'PACKING', 'SHIPPING', 'INBOUND', 'OUTBOUND'].sort(),
  );
});

test('CONTAINER_STATUS: 包含货柜主要状态', () => {
  const values = getSortedValues(CONTAINER_STATUS);

  assert.deepStrictEqual(
    values,
    ['PENDING', 'LOADING', 'SHIPPED', 'ARRIVED'].sort(),
  );
});

test('PURCHASE_STATUS: 覆盖采购流程状态', () => {
  const values = getSortedValues(PURCHASE_STATUS);

  assert.deepStrictEqual(
    values,
    ['DRAFT', 'SIGNED', 'PRODUCING', 'SHIPPED', 'RECEIVED', 'COMPLETED', 'CANCELLED'].sort(),
  );
});

test('SALES_STATUS: 覆盖销售流程状态', () => {
  const values = getSortedValues(SALES_STATUS);

  assert.deepStrictEqual(
    values,
    ['DRAFT', 'CONFIRMED', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED'].sort(),
  );
});

test('PAYMENT_TYPE: 覆盖应收与应付', () => {
  const values = getSortedValues(PAYMENT_TYPE);

  assert.deepStrictEqual(values, ['PAYABLE', 'RECEIVABLE'].sort());
});

test('NOTIFICATION_TYPE: 覆盖主要通知类型', () => {
  const values = getSortedValues(NOTIFICATION_TYPE);

  assert.deepStrictEqual(
    values,
    [
      'PAYMENT_DUE',
      'RECEIVABLE_DUE',
      'CONTAINER_ARRIVAL',
      'LOW_STOCK',
      'SYSTEM',
      'AGENT_CREDENTIAL',
      'TAX_REFUND_MONTHLY',
      'INVOICE_MISSING',
    ].sort(),
  );
});

test('IMPORT_STATUS: 覆盖导入全流程状态', () => {
  const values = getSortedValues(IMPORT_STATUS);

  assert.deepStrictEqual(
    values,
    ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].sort(),
  );
});
