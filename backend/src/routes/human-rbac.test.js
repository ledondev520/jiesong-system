/**
 * Input: finance/bank-flow/reports/dashboard 路由栈、供应商银行字段守卫、结算字段守卫
 * Output: 人类角色 RBAC 回归（ANTI-PLAN P0-4）
 * Pos: 后端路由权限测试，补足 rbac-write-routes 仅检查 "roleAuth(" 子串的缺口
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { redactSupplierForRole, sanitizeSupplierInput } = require('../agent/commands/supplier');
const { redactNestedSuppliers } = require('../agent/commands/supplier/bankFields');
const prisma = require('../utils/prisma');
const { settlementFieldGuard } = require('../middleware/settlementFieldGuard');

const rolesOf = (router, method, path) => {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `${method} ${path} missing`);
  const guards = layer.route.stack.map((s) => s.handle).filter((h) => h.isRoleAuth);
  return guards.length ? guards[0].allowedRoles : null;
};

test('finance: OD-8 every finance route is ADMIN only (SALES never sees finance)', () => {
  const finance = require('./finance');
  for (const [m, p] of [['post', '/payments/auto-match'], ['post', '/payments/:id/allocate'], ['post', '/auto-match'], ['post', '/match'], ['post', '/unmatch'], ['post', '/ignore'], ['post', '/payments']]) {
    assert.deepEqual(rolesOf(finance, m, p), ['ADMIN'], p);
  }
  for (const p of ['/unmatched', '/payments', '/payables', '/receivables', '/stats', '/payment-trends', '/overdue-receivables', '/unallocated-payments', '/contracts-for-match', '/statements', '/statements/analytics', '/statements/:year/:month']) {
    assert.deepEqual(rolesOf(finance, 'get', p), ['ADMIN'], p);
  }
});

test('bank-flow, business overview, analytics and invoice verification are ADMIN only (OD-8)', () => {
  const bank = require('./bankFlow');
  const gate = bank.stack.map((l) => l.handle).find((h) => h.isRoleAuth);
  assert.deepEqual(gate.allowedRoles, ['ADMIN']);
  assert.deepEqual(rolesOf(require('./reports'), 'get', '/business-overview'), ['ADMIN']);
  assert.deepEqual(rolesOf(require('./dashboard'), 'get', '/analytics'), ['ADMIN']);
  assert.deepEqual(rolesOf(require('./taxRefunds'), 'get', '/workbench/:salesContractId/invoice-verification'), ['ADMIN']);
});

test('供应商银行字段：SALES/Agent 读不到也写不进（OD-8：仅 ADMIN）', () => {
  const supplier = { id: 's1', name: 'n', bankName: 'b', bankAccount: '1', bankAccountName: 'a', bankBranch: 'x', bankCode: 'c' };
  for (const role of ['SALES', undefined]) {
    const out = redactSupplierForRole(role, supplier);
    assert.deepEqual(Object.keys(out).sort(), ['id', 'name']);
    assert.deepEqual(Object.keys(sanitizeSupplierInput(role, supplier)).sort(), ['id', 'name']);
  }
  assert.equal(sanitizeSupplierInput('ADMIN', supplier).bankAccount, '1');
  assert.equal(redactSupplierForRole('ADMIN', supplier).bankAccount, '1');
});

test('结算字段守卫：SALES 不能置 REFUNDED/VERIFIED 或写 refundedAmount', () => {
  const guard = settlementFieldGuard({ safeStatuses: ['DRAFT', 'APPLIED'], fields: ['refundedAmount'] });
  const run = (role, body) => { let err; guard({ user: { role }, body }, {}, (e) => { err = e; }); return err?.statusCode; };
  assert.equal(run('SALES', { status: 'REFUNDED' }), 403);
  assert.equal(run('SALES', { refundedAmount: 100 }), 403);
  assert.equal(run('SALES', { status: 'DRAFT', refundedAmount: 0 }), undefined);
  assert.equal(run('ADMIN', { status: 'REFUNDED', refundedAmount: 100 }), undefined);
});

test('结算字段守卫：SALES 不能修改已进入结算状态的记录（按库内当前状态）', async (t) => {
  const original = prisma.taxRefund.findUnique;
  t.after(() => { prisma.taxRefund.findUnique = original; });
  const guard = settlementFieldGuard({ safeStatuses: ['DRAFT', 'APPLIED'], fields: ['refundedAmount'], model: 'taxRefund' });
  const run = async (role, status, body) => {
    prisma.taxRefund.findUnique = async () => ({ status });
    let err;
    await guard({ user: { role }, body, params: { id: 'r1' } }, {}, (e) => { err = e; });
    return err?.statusCode;
  };
  assert.equal(await run('SALES', 'APPROVED', { status: 'DRAFT' }), 403);
  assert.equal(await run('SALES', 'REFUNDED', { declaredAmount: 1 }), 403);
  assert.equal(await run('SALES', 'DRAFT', { declaredAmount: 1 }), undefined);
  assert.equal(await run('ADMIN', 'REFUNDED', { status: 'DRAFT' }), undefined);
});

test('嵌套 supplier 银行字段：无银行权限角色被剔除，其他字段保留', () => {
  const row = { id: 'p1', supplier: { id: 's1', name: 'n', bankAccount: '1' }, suppliers: [{ supplier: { id: 's2', bankName: 'b' } }] };
  const out = redactNestedSuppliers('SALES', row);
  assert.deepEqual(out.supplier, { id: 's1', name: 'n' });
  assert.deepEqual(out.suppliers[0].supplier, { id: 's2' });
  assert.equal(redactNestedSuppliers('ADMIN', row).supplier.bankAccount, '1');
});
