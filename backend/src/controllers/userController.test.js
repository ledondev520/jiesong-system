/**
 * Input: userController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('userController: 模块可正常加载并导出', () => {
  const mod = require('./userController');
  assert.ok(mod !== undefined);
});

const prisma = require('../utils/prisma');
const controller = require('./userController');

// 记录事务内调用；existing 为事务内读到的用户当前状态
const mockTx = (t, existing, { otherAdmins = 1 } = {}) => {
  const calls = { updates: [], revoked: [] };
  const tx = {
    user: {
      findUnique: async () => existing,
      count: async () => otherAdmins,
      update: async (args) => { calls.updates.push(args.data); return { id: 'u1', ...args.data }; },
    },
    browserSession: { deleteMany: async (args) => { calls.revoked.push(args.where); return { count: 2 }; } },
  };
  const original = prisma.$transaction;
  prisma.$transaction = async (cb) => cb(tx);
  t.after(() => { prisma.$transaction = original; });
  return calls;
};
const run = (handler, req) => new Promise((resolve) => {
  const res = { status() { return res; }, json: (body) => resolve({ body }) };
  handler(req, res, (error) => resolve({ error }));
});

test('update: 角色变更递增 sessionVersion 并撤销该用户全部浏览器会话', async (t) => {
  const calls = mockTx(t, { role: 'SALES', isActive: true });
  const { error } = await run(controller.update, { params: { id: 'u1' }, body: { role: 'FINANCE' }, user: { id: 'admin' } });
  assert.equal(error, undefined);
  assert.deepEqual(calls.updates[0].sessionVersion, { increment: 1 });
  assert.deepEqual(calls.revoked, [{ userId: 'u1' }]);
});

test('update: 仅改姓名或角色未变时不撤销会话', async (t) => {
  const calls = mockTx(t, { role: 'SALES', isActive: true });
  await run(controller.update, { params: { id: 'u1' }, body: { name: 'x', role: 'SALES', isActive: true }, user: { id: 'admin' } });
  assert.equal(calls.updates[0].sessionVersion, undefined);
  assert.deepEqual(calls.revoked, []);
});

test('update: 管理员绑定或修改邮箱写入 email/phone，递增 sessionVersion 并撤销浏览器会话', async (t) => {
  const calls = mockTx(t, { role: 'SALES', isActive: true });
  const { error } = await run(controller.update, { params: { id: 'u1' }, body: { email: 'synthetic-user@example.test', phone: '+86 000-0000' }, user: { id: 'admin' } });
  assert.equal(error, undefined);
  assert.equal(calls.updates[0].email, 'synthetic-user@example.test');
  assert.equal(calls.updates[0].phone, '+86 000-0000');
  assert.deepEqual(calls.updates[0].sessionVersion, { increment: 1 });
  assert.deepEqual(calls.revoked, [{ userId: 'u1' }]);
});

test('update: 只改电话不撤销会话', async (t) => {
  const calls = mockTx(t, { role: 'SALES', isActive: true });
  await run(controller.update, { params: { id: 'u1' }, body: { phone: '+86 000-0001' }, user: { id: 'admin' } });
  assert.equal(calls.updates[0].phone, '+86 000-0001');
  assert.equal(calls.updates[0].sessionVersion, undefined);
  assert.deepEqual(calls.revoked, []);
});

test('remove: DELETE 改为软停用并撤销会话，不物理删除', async (t) => {
  const calls = mockTx(t, { role: 'SALES', isActive: true });
  const originalDelete = prisma.user.delete;
  prisma.user.delete = async () => { throw new Error('不得物理删除'); };
  t.after(() => { prisma.user.delete = originalDelete; });
  const { error } = await run(controller.remove, { params: { id: 'u1' }, user: { id: 'admin' } });
  assert.equal(error, undefined);
  assert.equal(calls.updates[0].isActive, false);
  assert.deepEqual(calls.updates[0].sessionVersion, { increment: 1 });
  assert.deepEqual(calls.revoked, [{ userId: 'u1' }]);
});

test('remove: 不能停用自己，也不能停用最后一个有效 ADMIN', async (t) => {
  const self = await run(controller.remove, { params: { id: 'admin' }, user: { id: 'admin' } });
  assert.equal(self.error.statusCode, 400);
  const calls = mockTx(t, { role: 'ADMIN', isActive: true }, { otherAdmins: 0 });
  const last = await run(controller.remove, { params: { id: 'u1' }, user: { id: 'admin' } });
  assert.equal(last.error.statusCode, 400);
  assert.deepEqual(calls.updates, []);
  assert.deepEqual(calls.revoked, []);
});

test('update: 不能经 PUT 降级或停用自己及最后一个有效 ADMIN', async (t) => {
  const self = mockTx(t, { role: 'ADMIN', isActive: true });
  const demoteSelf = await run(controller.update, { params: { id: 'admin' }, body: { role: 'SALES' }, user: { id: 'admin' } });
  assert.equal(demoteSelf.error.statusCode, 400);
  assert.deepEqual(self.updates, []);
  mockTx(t, { role: 'ADMIN', isActive: true }, { otherAdmins: 0 });
  const last = await run(controller.update, { params: { id: 'u1' }, body: { isActive: false }, user: { id: 'admin' } });
  assert.equal(last.error.statusCode, 400);
  const ok = mockTx(t, { role: 'ADMIN', isActive: true }, { otherAdmins: 1 });
  assert.equal((await run(controller.update, { params: { id: 'u1' }, body: { role: 'SALES' }, user: { id: 'admin' } })).error, undefined);
  assert.equal(ok.updates.length, 1);
});
