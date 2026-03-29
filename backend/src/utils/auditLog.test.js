/**
 * Input: auditLog 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('./prisma');

test('auditLog: 模块可正常加载并导出', () => {
  const mod = require('./auditLog');
  assert.ok(mod !== undefined);
});

test('auditLog: 支持写入 Agent actor 字段', async () => {
  const mod = require('./auditLog');
  const originalCreate = prisma.operationLog.create;
  let captured = null;

  prisma.operationLog.create = async ({ data }) => {
    captured = data;
    return data;
  };

  try {
    await mod.logOperation({
      actorType: 'AGENT',
      agentAccountId: 'agent-1',
      agentCredentialId: 'cred-1',
      action: 'CREATE',
      entity: 'PurchaseContract',
      entityId: 'purchase-1',
      newValue: { id: 'purchase-1' },
      req: { headers: { 'user-agent': 'node:test' }, ip: '127.0.0.1' },
    });

    assert.ok(captured);
    assert.equal(captured.actorType, 'AGENT');
    assert.equal(captured.userId, null);
    assert.equal(captured.agentAccountId, 'agent-1');
    assert.equal(captured.agentCredentialId, 'cred-1');
    assert.equal(captured.action, 'CREATE');
    assert.equal(captured.entity, 'PurchaseContract');
  } finally {
    prisma.operationLog.create = originalCreate;
  }
});
