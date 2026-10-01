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

test('金额区间在分页前筛选，列表/总数/统计使用同一条件', async (t) => {
 const original={findMany:prisma.bankTransaction.findMany,count:prisma.bankTransaction.count,aggregate:prisma.bankTransaction.aggregate};
 t.after(()=>Object.assign(prisma.bankTransaction,original));
 const calls=[];
 prisma.bankTransaction.findMany=async(args)=>{calls.push(args);return[];};
 prisma.bankTransaction.count=async(args)=>{calls.push(args);return 0;};
 prisma.bankTransaction.aggregate=async(args)=>{calls.push(args);return {_sum:{amount:0},_count:0};};
 await bankFlowService.listTransactions({amountMin:10,amountMax:20,currency:'USD',page:2,pageSize:20});
 await bankFlowService.getStats({amountMin:10,amountMax:20,currency:'USD'});
 assert.deepEqual(calls[0].where.AND,[{OR:[{amount:{gte:10,lte:20}},{amount:{gte:-20,lte:-10}}]}]);
 assert.ok(calls.every(c=>c.where.currency==='USD'&&JSON.stringify(c.where.AND)===JSON.stringify(calls[0].where.AND)));
 assert.equal(calls[0].skip,20);
});
