const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const {
  listAgentCredentialAlerts,
  createAgentCredentialNotifications,
  runDailyAgentCredentialAlertCheck,
} = require('./agentCredentialAlertService');

test('listAgentCredentialAlerts: 返回即将过期和已过期的活跃凭证', async () => {
  const originalFindMany = prisma.agentCredential.findMany;
  const checkedAt = new Date('2026-03-29T00:00:00.000Z');

  prisma.agentCredential.findMany = async () => ([
    {
      id: 'cred-1',
      label: '采购机器人',
      status: 'ACTIVE',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      agentAccount: { id: 'agent-1', name: '采购机器人', slug: 'purchase-bot' },
    },
    {
      id: 'cred-2',
      label: '销售机器人',
      status: 'ACTIVE',
      expiresAt: new Date('2026-03-28T00:00:00.000Z'),
      agentAccount: { id: 'agent-2', name: '销售机器人', slug: 'sales-bot' },
    },
  ]);

  try {
    const result = await listAgentCredentialAlerts(prisma, {
      warningDays: 14,
      checkedAt,
    });

    assert.equal(result.alerts.length, 2);
    assert.equal(result.alerts.find((item) => item.credentialId === 'cred-1')?.severity, 'warning');
    assert.equal(result.alerts.find((item) => item.credentialId === 'cred-2')?.severity, 'critical');
  } finally {
    prisma.agentCredential.findMany = originalFindMany;
  }
});

test('createAgentCredentialNotifications: 每天对同一 credential 去重', async () => {
  const originalUserFindMany = prisma.user.findMany;
  const originalNotificationFindMany = prisma.notification.findMany;
  const originalCreateMany = prisma.notification.createMany;
  let createArgs = null;

  prisma.user.findMany = async () => ([{ id: 'admin-1' }]);
  prisma.notification.findMany = async () => ([
    { userId: 'admin-1', metadata: JSON.stringify({ credentialId: 'cred-1', event: 'EXPIRING_SOON' }) },
  ]);
  prisma.notification.createMany = async (args) => {
    createArgs = args;
    return { count: args.data.length };
  };

  try {
    const result = await createAgentCredentialNotifications(prisma, [
      {
        credentialId: 'cred-1',
        agentAccountId: 'agent-1',
        agentName: '采购机器人',
        credentialLabel: '采购机器人',
        severity: 'warning',
        event: 'EXPIRING_SOON',
        checkedAt: '2026-03-29T00:00:00.000Z',
        expiresAt: '2026-04-01T00:00:00.000Z',
        daysRemaining: 3,
      },
      {
        credentialId: 'cred-2',
        agentAccountId: 'agent-2',
        agentName: '销售机器人',
        credentialLabel: '销售机器人',
        severity: 'critical',
        event: 'EXPIRED',
        checkedAt: '2026-03-29T00:00:00.000Z',
        expiresAt: '2026-03-28T00:00:00.000Z',
        daysRemaining: -1,
      },
    ], {
      todayStart: new Date('2026-03-29T00:00:00.000Z'),
    });

    assert.equal(result.created, 1);
    assert.equal(createArgs.data[0].type, 'AGENT_CREDENTIAL');
  } finally {
    prisma.user.findMany = originalUserFindMany;
    prisma.notification.findMany = originalNotificationFindMany;
    prisma.notification.createMany = originalCreateMany;
  }
});

test('runDailyAgentCredentialAlertCheck: 无风险凭证时返回零通知', async () => {
  const originalFindMany = prisma.agentCredential.findMany;
  const originalUserFindMany = prisma.user.findMany;
  prisma.agentCredential.findMany = async () => [];
  prisma.user.findMany = async () => {
    throw new Error('不应查询管理员');
  };

  try {
    const result = await runDailyAgentCredentialAlertCheck(prisma, {
      checkedAt: new Date('2026-03-29T00:00:00.000Z'),
    });

    assert.equal(result.alertCount, 0);
    assert.equal(result.created, 0);
  } finally {
    prisma.agentCredential.findMany = originalFindMany;
    prisma.user.findMany = originalUserFindMany;
  }
});
