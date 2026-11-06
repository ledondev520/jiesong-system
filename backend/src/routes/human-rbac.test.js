/**
 * Input: finance/bank-flow/reports/dashboard 路由栈、供应商银行字段守卫、结算字段守卫
 * Output: 人类角色 RBAC 回归（ANTI-PLAN P0-4）
 * Pos: 后端路由权限测试，补足 rbac-write-routes 仅检查 "roleAuth(" 子串的缺口
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { redactSupplierForRole, sanitizeSupplierInput } = require('../agent/commands/supplier');
const { settlementFieldGuard } = require('../middleware/settlementFieldGuard');

const rolesOf = (router, method, path) => {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `${method} ${path} missing`);
  const guards = layer.route.stack.map((s) => s.handle).filter((h) => h.isRoleAuth);
  return guards.length ? guards[0].allowedRoles : null;
};

test('finance: 写路由仅 ADMIN/FINANCE，付款登记按类型限角色，WAREHOUSE 无账务读', () => {
  const finance = require('./finance');
  assert.deepEqual(rolesOf(finance, 'post', '/payments/auto-match'), ['ADMIN', 'SALES', 'FINANCE']);
  assert.deepEqual(rolesOf(finance, 'post', '/payments/:id/allocate'), ['ADMIN', 'SALES', 'FINANCE']);
  for (const [m, p] of [['post', '/auto-match'], ['post', '/match'], ['post', '/unmatch'], ['post', '/ignore']]) {
    assert.deepEqual(rolesOf(finance, m, p), ['ADMIN', 'FINANCE'], p);
  }
  assert.deepEqual(rolesOf(finance, 'post', '/payments'), ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE']);
  assert.deepEqual(rolesOf(finance, 'get', '/unmatched'), ['ADMIN', 'FINANCE', 'BOSS']); // 返回银行流水
  for (const p of ['/payments', '/payables', '/receivables', '/stats', '/payment-trends', '/overdue-receivables', '/unallocated-payments', '/contracts-for-match']) {
    const roles = rolesOf(finance, 'get', p);
    assert.ok(roles && !roles.includes('WAREHOUSE'), p);
  }
  for (const p of ['/statements', '/statements/analytics', '/statements/:year/:month']) {
    assert.deepEqual(rolesOf(finance, 'get', p), ['ADMIN', 'FINANCE', 'BOSS'], p);
  }
});

test('bank-flow 整个路由仅 ADMIN/FINANCE/BOSS；报表与发票核验按计划收紧', () => {
  const bank = require('./bankFlow');
  const gate = bank.stack.map((l) => l.handle).find((h) => h.isRoleAuth);
  assert.deepEqual(gate.allowedRoles, ['ADMIN', 'FINANCE', 'BOSS']);
  assert.deepEqual(rolesOf(require('./reports'), 'get', '/business-overview'), ['ADMIN', 'FINANCE', 'BOSS']);
  assert.ok(!rolesOf(require('./dashboard'), 'get', '/analytics').includes('WAREHOUSE'));
  assert.deepEqual(rolesOf(require('./taxRefunds'), 'get', '/workbench/:salesContractId/invoice-verification'), ['ADMIN', 'FINANCE']);
});

test('付款类型守卫：PURCHASE 只能付应付，SALES 只能登记应收，WAREHOUSE 被拒', () => {
  const finance = require('./finance');
  const layer = finance.stack.find((l) => l.route && l.route.path === '/payments' && l.route.methods.post);
  const guard = layer.route.stack.map((s) => s.handle).find((h) => h.name === 'paymentTypeByRole');
  const run = (role, type) => { let err; guard({ user: { role }, body: { type } }, {}, (e) => { err = e; }); return err?.statusCode; };
  assert.equal(run('PURCHASE', 'PAYABLE_PAYMENT'), undefined);
  assert.equal(run('PURCHASE', 'RECEIVABLE_COLLECTION'), 403);
  assert.equal(run('SALES', 'RECEIVABLE_COLLECTION'), undefined);
  assert.equal(run('SALES', 'PAYABLE'), 403);
  assert.equal(run('FINANCE', 'EXPENSE'), undefined);
});

test('供应商银行字段：SALES/WAREHOUSE/Agent 读不到也写不进', () => {
  const supplier = { id: 's1', name: 'n', bankName: 'b', bankAccount: '1', bankAccountName: 'a', bankBranch: 'x', bankCode: 'c' };
  for (const role of ['SALES', 'WAREHOUSE', undefined]) {
    const out = redactSupplierForRole(role, supplier);
    assert.deepEqual(Object.keys(out).sort(), ['id', 'name']);
    assert.deepEqual(Object.keys(sanitizeSupplierInput(role, supplier)).sort(), ['id', 'name']);
  }
  for (const role of ['ADMIN', 'FINANCE', 'PURCHASE']) assert.equal(sanitizeSupplierInput(role, supplier).bankAccount, '1');
  assert.equal(redactSupplierForRole('BOSS', supplier).bankAccount, '1');
  assert.equal(sanitizeSupplierInput('BOSS', supplier).bankAccount, undefined);
});

test('结算字段守卫：SALES 不能置 REFUNDED/VERIFIED 或写 refundedAmount', () => {
  const guard = settlementFieldGuard({ safeStatuses: ['DRAFT', 'APPLIED'], fields: ['refundedAmount'] });
  const run = (role, body) => { let err; guard({ user: { role }, body }, {}, (e) => { err = e; }); return err?.statusCode; };
  assert.equal(run('SALES', { status: 'REFUNDED' }), 403);
  assert.equal(run('SALES', { refundedAmount: 100 }), 403);
  assert.equal(run('SALES', { status: 'DRAFT', refundedAmount: 0 }), undefined);
  assert.equal(run('FINANCE', { status: 'REFUNDED', refundedAmount: 100 }), undefined);
});
