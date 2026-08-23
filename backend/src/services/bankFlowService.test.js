/**
 * Input: bankFlowService 与仿真 Prisma 银行流水聚合
 * Output: 默认人民币统计和美元收入汇总的币种隔离回归测试
 * Pos: 银行流水币种隔离 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const prisma = require('../utils/prisma');
const bankFlowService = require('./bankFlowService');

test('getStats: 未显式指定时只统计CNY，避免人民币美元直接相加', async (t) => {
  const originalAggregate = prisma.bankTransaction.aggregate;
  const calls = [];
  t.after(() => { prisma.bankTransaction.aggregate = originalAggregate; });
  prisma.bankTransaction.aggregate = async (args) => {
    calls.push(args);
    return { _sum: { amount: args.where.direction === 'IN' ? 100 : -40 }, _count: 1 };
  };

  const result = await bankFlowService.getStats();

  assert.strictEqual(result.currency, 'CNY');
  assert.strictEqual(result.netFlow, 60);
  assert.ok(calls.every((call) => call.where.currency === 'CNY'));
});

test('getIncomingSummary: 应收到账只聚合USD收入', async (t) => {
  const originalFindMany = prisma.bankTransaction.findMany;
  let where;
  t.after(() => { prisma.bankTransaction.findMany = originalFindMany; });
  prisma.bankTransaction.findMany = async (args) => {
    where = args.where;
    return [{ counterpart: 'SP FOOD TRADING LLC', amount: 1000 }];
  };

  const result = await bankFlowService.getIncomingSummary();

  assert.deepEqual(where, { direction: 'IN', currency: 'USD' });
  assert.strictEqual(result.total, 1000);
});
