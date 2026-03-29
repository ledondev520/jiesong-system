const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAgentAccount,
  issueAgentCredential,
  revokeAgentCredential,
  rotateAgentCredential,
} = require('./agentAccountService');

test('createAgentAccount: 创建账号并写入 grants', async () => {
  const calls = [];
  const prisma = {
    $transaction: async (handler) => handler({
      agentAccount: {
        create: async ({ data }) => {
          calls.push(['agent.create', data]);
          return { id: 'agent-1', ...data };
        },
        findUnique: async () => ({
          id: 'agent-1',
          name: '采购机器人',
          slug: 'purchase-bot',
          status: 'ACTIVE',
          defaultMode: 'READ_INGEST',
          grants: [{ resource: 'search', action: 'read', scopeJson: null }],
          credentials: [],
        }),
      },
      agentGrant: {
        createMany: async ({ data }) => {
          calls.push(['grant.createMany', data]);
          return { count: data.length };
        },
      },
    }),
  };

  const result = await createAgentAccount({
    input: {
      name: '采购机器人',
      slug: 'purchase-bot',
      grants: [{ resource: 'search', action: 'read' }],
    },
    prismaClient: prisma,
  });

  assert.equal(result.id, 'agent-1');
  assert.equal(calls[0][0], 'agent.create');
  assert.equal(calls[1][0], 'grant.createMany');
});

test('issueAgentCredential: 返回一次性 token 且只保存 hash', async () => {
  let createPayload = null;
  const prisma = {
    agentAccount: {
      findUnique: async () => ({ id: 'agent-1', status: 'ACTIVE' }),
    },
    agentCredential: {
      count: async () => 0,
      create: async ({ data }) => {
        createPayload = data;
        return {
          id: 'cred-1',
          credentialKey: data.credentialKey,
          label: data.label,
          status: 'ACTIVE',
          expiresAt: data.expiresAt,
          createdAt: new Date('2026-03-29T10:00:00.000Z'),
        };
      },
    },
    user: {
      findMany: async () => ([{ id: 'admin-1' }]),
    },
    notification: {
      createMany: async ({ data }) => ({ count: data.length }),
    },
  };

  const result = await issueAgentCredential({
    agentAccountId: 'agent-1',
    label: 'OpenClaw',
    prismaClient: prisma,
  });

  assert.match(result.token, /^jsa_/);
  assert.equal(createPayload.label, 'OpenClaw');
  assert.match(createPayload.secretHash, /^sha256:/);
  assert.ok(createPayload.secretPreview);
  assert.ok(createPayload.expiresAt instanceof Date);
});

test('issueAgentCredential: 活跃凭证达到上限时拒绝', async () => {
  const prisma = {
    agentAccount: {
      findUnique: async () => ({ id: 'agent-1', status: 'ACTIVE' }),
    },
    agentCredential: {
      count: async () => 2,
    },
  };

  await assert.rejects(
    () => issueAgentCredential({
      agentAccountId: 'agent-1',
      prismaClient: prisma,
    }),
    /活跃凭证已达到上限/
  );
});

test('revokeAgentCredential: 标记 revokedAt 与状态', async () => {
  let updatePayload = null;
  const prisma = {
    agentCredential: {
      update: async ({ where, data }) => {
        updatePayload = { where, data };
        return {
          id: where.id,
          status: data.status,
          revokedAt: data.revokedAt,
          agentAccountId: 'agent-1',
          credentialKey: 'cred-key',
          agentAccount: { id: 'agent-1', name: '采购机器人' },
        };
      },
    },
    user: {
      findMany: async () => ([{ id: 'admin-1' }]),
    },
    notification: {
      createMany: async ({ data }) => ({ count: data.length }),
    },
  };

  const result = await revokeAgentCredential({
    credentialId: 'cred-1',
    prismaClient: prisma,
  });

  assert.equal(result.status, 'REVOKED');
  assert.equal(updatePayload.where.id, 'cred-1');
  assert.ok(updatePayload.data.revokedAt instanceof Date);
});

test('rotateAgentCredential: 吊销旧 credential 并签发新 token', async () => {
  const calls = [];
  const prisma = {
    $transaction: async (handler) => handler({
      agentCredential: {
        count: async () => 0,
        findUnique: async () => ({
          id: 'cred-old',
          agentAccountId: 'agent-1',
          status: 'ACTIVE',
          agentAccount: { id: 'agent-1', status: 'ACTIVE' },
        }),
        update: async ({ where, data }) => {
          calls.push(['credential.update', where, data.status]);
          return { id: where.id, status: data.status };
        },
        create: async ({ data }) => {
          calls.push(['credential.create', data.label]);
          return {
            id: 'cred-new',
            credentialKey: data.credentialKey,
            label: data.label,
            status: 'ACTIVE',
            expiresAt: data.expiresAt,
            createdAt: new Date('2026-03-29T10:00:00.000Z'),
          };
        },
      },
      user: {
        findMany: async () => ([{ id: 'admin-1' }]),
      },
      notification: {
        createMany: async ({ data }) => ({ count: data.length }),
      },
    }),
  };

  const result = await rotateAgentCredential({
    credentialId: 'cred-old',
    prismaClient: prisma,
  });

  assert.match(result.token, /^jsa_/);
  assert.deepEqual(calls.map((item) => item[0]), ['credential.update', 'credential.create']);
});
