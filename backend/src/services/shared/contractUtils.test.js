/**
 * Input: contractUtils
 * Output: 合同服务共享工具测试
 * Pos: 后端服务工具测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeFilterStatus,
  parseNullableNumber,
  generateNextContractNo,
} = require('./contractUtils');

test('normalizeFilterStatus: 大小写与连字符归一化', () => {
  assert.equal(normalizeFilterStatus('PENDING'), 'PENDING');
  assert.equal(normalizeFilterStatus('loading'), 'LOADING');
  assert.equal(normalizeFilterStatus('out_stock'), 'OUT_STOCK');
  assert.equal(normalizeFilterStatus('pending-shipment'), 'PENDING_SHIPMENT');
  assert.equal(normalizeFilterStatus('SHIPPED'), 'SHIPPED');
});

test('parseNullableNumber: 解析数字并处理 fallback', () => {
  assert.equal(parseNullableNumber('10.5'), 10.5);
  assert.equal(parseNullableNumber('', 3), 3);
  assert.equal(parseNullableNumber('abc', 7), 7);
  assert.equal(parseNullableNumber(undefined), null);
});

test('generateNextContractNo: 按港口和默认格式分别生成编号', async () => {
  const calls = [];
  const prisma = {
    salesContract: {
      count: async (args) => {
        calls.push(args);
        return calls.length === 1 ? 2 : 9;
      },
    },
  };

  const byPort = await generateNextContractNo({
    prisma,
    year: '26',
    portCode: 'LA',
  });
  const defaultNo = await generateNextContractNo({
    prisma,
    year: '26',
  });

  assert.equal(byPort, '26-003-LA');
  assert.equal(defaultNo, 'EXP2600010');
  assert.deepEqual(calls[0], {
    where: {
      contractNo: {
        startsWith: '26-',
        endsWith: '-LA',
      },
    },
  });
  assert.deepEqual(calls[1], {
    where: {
      contractNo: {
        startsWith: 'EXP26',
      },
    },
  });
});
