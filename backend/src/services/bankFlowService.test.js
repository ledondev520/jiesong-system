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

// B68→B69 (P1-3): 单对手方合计不受 200 行上限影响；对账别名合并不重复计发票
test('getCounterpartTotals: 数据库聚合 + 精确户名（含括号变体），不用 summary/txnId 子串，不受分页上限影响', async (t) => {
  const original = prisma.bankTransaction.groupBy;
  let args;
  t.after(() => { prisma.bankTransaction.groupBy = original; });
  prisma.bankTransaction.groupBy = async (a) => {
    args = a;
    return [
      { direction: 'OUT', _sum: { amount: -500000 }, _count: { _all: 450 } },
      { direction: 'IN', _sum: { amount: 1000 }, _count: { _all: 3 } },
    ];
  };

  const totals = await bankFlowService.getCounterpartTotals({ counterpart: '示例(上海)公司' });

  assert.equal(totals.totalPaid, 500000);
  assert.equal(totals.totalReceived, 1000);
  assert.equal(totals.txnCount, 453);
  assert.equal(args.where.currency, 'CNY');
  assert.deepEqual(args.where.counterpart.in.sort(), ['示例(上海)公司', '示例（上海）公司'].sort());
  assert.equal(args.where.OR, undefined);
});

test('runReconciliation: 两个付款别名包含匹配同一发票销方时合并，发票总额只计一次；泛词与多候选不匹配', async (t) => {
  const originalTxn = prisma.bankTransaction.findMany;
  const originalInv = prisma.invoiceRecord.findMany;
  t.after(() => { prisma.bankTransaction.findMany = originalTxn; prisma.invoiceRecord.findMany = originalInv; });
  const out = (counterpart, amount) => ({ counterpart, direction: 'OUT', amount: -amount });
  prisma.bankTransaction.findMany = async () => [
    out('示例食品（上海）有限公司', 600),
    out('示例食品(上海)', 400),      // 别名，包含匹配同一销方
    out('贸易', 5000),               // 泛词，不得匹配任何发票
    out('华东食品', 3000),            // 同时被两家销方包含，歧义不匹配
  ];
  prisma.invoiceRecord.findMany = async () => [
    { seller: '示例食品(上海)有限公司', total: 1000, tax: 130 },
    { seller: '上海华东食品有限公司', total: 7000, tax: 0 },
    { seller: '北京华东食品有限公司', total: 8000, tax: 0 },
    { seller: '上海贸易有限公司', total: 9000, tax: 0 },
  ];

  const result = await bankFlowService.runReconciliation();

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].netPaid, 1000);
  assert.equal(result.matched[0].totalInvoice, 1000);
  assert.equal(result.matched[0].category, 'normal');
  assert.equal(result.summary.overInvoicedCount, 0);
  assert.deepEqual(result.unmatchedPayments.map((p) => p.counterpart).sort(), ['华东食品', '贸易']);
});
