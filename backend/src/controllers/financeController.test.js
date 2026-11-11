/**
 * Input: financeController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('financeController: 模块可正常加载并导出', () => {
  const mod = require('./financeController');
  assert.ok(mod !== undefined);
});

// ANTI-R3 P1-1: payment responses nest purchaseContract.supplier; bank fields (Restricted) only for bank roles. Synthetic data.
test('financeController: 付款列表/创建响应按角色剔除供应商银行字段', async () => {
  const financeService = require('../services/financeService');
  const original = { listPayments: financeService.listPayments, createPayment: financeService.createPayment };
  const BANK = { bankAccountName: 'SYNTH-NAME', bankName: 'SYNTH-BANK', bankBranch: 'SYNTH-BRANCH', bankCode: 'SYNTH-CODE', bankAccount: 'SYNTH-0000' };
  const payment = () => ({ id: 'pay-1', purchaseContract: { id: 'pc-1', supplier: { id: 's-1', name: 'Synth Supplier', ...BANK } } });
  financeService.listPayments = async () => ({ payments: [payment()], total: 1 });
  let reused = false;
  financeService.createPayment = async () => ({ payment: payment(), reused });
  try {
    const { listPayments, createPayment } = require('./financeController');
    const call = async (fn, role) => {
      let body;
      const res = { status() { return this; }, json(b) { body = b; return this; } };
      await fn({ query: {}, body: {}, get: () => undefined, user: { role } }, res, (e) => { throw e; });
      return JSON.stringify(body);
    };
    // reused:true 是幂等重放分支（单独一处 redact），不能只测新建分支
    for (const replay of [false, true]) {
      reused = replay;
      for (const fn of [listPayments, createPayment]) {
        for (const role of ['SALES']) {
          const text = await call(fn, role);
          assert.ok(text.includes('Synth Supplier'), `${role} keeps supplier name`);
          assert.ok(!/SYNTH-(NAME|BANK|BRANCH|CODE|0000)/.test(text), `${fn.name} ${role} reused=${replay} must not carry bank fields`);
        }
        for (const role of ['ADMIN']) { // OD-8: supplier bank fields are ADMIN only
          assert.ok((await call(fn, role)).includes('SYNTH-0000'), `${fn.name} ${role} reused=${replay} keeps bank fields`);
        }
      }
    }
  } finally {
    Object.assign(financeService, original);
  }
});
