/**
 * Input: Agent 账号与凭证管理请求
 * Output: Agent 账号、grant、credential 生命周期能力
 * Pos: Agent 管理服务层
 */

const crypto = require('node:crypto');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { AGENT_TOKEN_PREFIX, hashAgentSecret } = require('../utils/agentCredentials');
const { NOTIFICATION_TYPE, ROLES } = require('../config/constants');

const DEFAULT_CREDENTIAL_EXPIRES_DAYS = 90;
const MAX_CREDENTIAL_EXPIRES_DAYS = 365;
const MAX_ACTIVE_CREDENTIALS_PER_AGENT = 2;
const runInTransaction = (prismaClient, handler) => (
  typeof prismaClient.$transaction === 'function'
    ? prismaClient.$transaction(handler)
    : handler(prismaClient)
);

const sanitizeGrant = (grant) => {
  if (!grant || typeof grant !== 'object') {
    throw createError('grant 格式非法', 400);
  }
  const resource = String(grant.resource || '').trim();
  const action = String(grant.action || '').trim();
  if (!resource || !action) {
    throw createError('grant 必须包含 resource 和 action', 400);
  }
  return {
    resource,
    action,
    scopeJson: grant.scopeJson ? JSON.stringify(grant.scopeJson) : null,
  };
};

const issueCredentialMaterial = () => {
  const credentialKey = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  return {
    credentialKey,
    token: `${AGENT_TOKEN_PREFIX}${credentialKey}.${secret}`,
    secretHash: hashAgentSecret(secret),
    secretPreview: `${secret.slice(0, 4)}...${secret.slice(-4)}`,
  };
};

const serializeCredential = (credential) => ({
  id: credential.id,
  credentialKey: credential.credentialKey,
  label: credential.label || null,
  status: credential.status,
  secretPreview: credential.secretPreview || null,
  expiresAt: credential.expiresAt || null,
  lastUsedAt: credential.lastUsedAt || null,
  createdAt: credential.createdAt,
  revokedAt: credential.revokedAt || null,
});

const resolveExpiresAt = (expiresInDays) => {
  const parsed = Number.parseInt(String(expiresInDays || DEFAULT_CREDENTIAL_EXPIRES_DAYS), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_CREDENTIAL_EXPIRES_DAYS) {
    throw createError(`expiresInDays 必须在 1-${MAX_CREDENTIAL_EXPIRES_DAYS} 之间`, 400);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parsed);
  return expiresAt;
};

const notifyAdmins = async (tx, { title, content, metadata }) => {
  const admins = await tx.user.findMany({
    where: {
      isActive: true,
      role: ROLES.ADMIN,
    },
    select: { id: true },
  });

  if (!admins.length) return;

  await tx.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: NOTIFICATION_TYPE.AGENT_CREDENTIAL,
      title,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })),
  });
};

const listAgentAccounts = async ({ page = 1, pageSize = 20, prismaClient = prisma } = {}) => {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prismaClient.agentAccount.findMany({
      skip,
      take: pageSize,
      include: {
        grants: true,
        credentials: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prismaClient.agentAccount.count(),
  ]);
  return { items, total };
};

const getAgentAccountById = async ({ id, prismaClient = prisma }) => {
  const account = await prismaClient.agentAccount.findUnique({
    where: { id },
    include: {
      grants: true,
      credentials: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!account) {
    throw createError('Agent 账号不存在', 404);
  }
  return account;
};

const createAgentAccount = async ({ input, prismaClient = prisma } = {}) => {
  const data = input || {};
  const name = String(data.name || '').trim();
  const slug = String(data.slug || '').trim();
  if (!name || !slug) {
    throw createError('name 和 slug 不能为空', 400);
  }

  const grants = Array.isArray(data.grants) ? data.grants.map(sanitizeGrant) : [];

  return runInTransaction(prismaClient, async (tx) => {
    const account = await tx.agentAccount.create({
      data: {
        name,
        slug,
        description: data.description || null,
        status: data.status || 'ACTIVE',
        defaultMode: data.defaultMode || 'READ_INGEST',
      },
    });

    if (grants.length) {
      await tx.agentGrant.createMany({
        data: grants.map((grant) => ({
          agentAccountId: account.id,
          ...grant,
        })),
      });
    }

    return tx.agentAccount.findUnique({
      where: { id: account.id },
      include: {
        grants: true,
        credentials: true,
      },
    });
  });
};

const updateAgentAccount = async ({ id, input, prismaClient = prisma } = {}) => {
  const data = input || {};
  const grants = Array.isArray(data.grants) ? data.grants.map(sanitizeGrant) : null;

  return prismaClient.$transaction(async (tx) => {
    const account = await tx.agentAccount.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        status: data.status,
        defaultMode: data.defaultMode,
      },
    });

    if (grants) {
      await tx.agentGrant.deleteMany({ where: { agentAccountId: id } });
      if (grants.length) {
        await tx.agentGrant.createMany({
          data: grants.map((grant) => ({
            agentAccountId: id,
            ...grant,
          })),
        });
      }
    }

    return tx.agentAccount.findUnique({
      where: { id: account.id },
      include: {
        grants: true,
        credentials: true,
      },
    });
  });
};

const issueAgentCredential = async ({ agentAccountId, label, expiresInDays, prismaClient = prisma } = {}) => {
  return runInTransaction(prismaClient, async (tx) => {
    const account = await tx.agentAccount.findUnique({
      where: { id: agentAccountId },
    });
    if (!account || account.status !== 'ACTIVE') {
      throw createError('Agent 账号不存在或不可用', 404);
    }

    const activeCount = await tx.agentCredential.count({
      where: {
        agentAccountId,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });
    if (activeCount >= MAX_ACTIVE_CREDENTIALS_PER_AGENT) {
      throw createError(`活跃凭证已达到上限（${MAX_ACTIVE_CREDENTIALS_PER_AGENT}）`, 400);
    }

    const material = issueCredentialMaterial();
    const expiresAt = resolveExpiresAt(expiresInDays);
    const credential = await tx.agentCredential.create({
      data: {
        agentAccountId,
        credentialKey: material.credentialKey,
        label: label || null,
        secretHash: material.secretHash,
        secretPreview: material.secretPreview,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    await notifyAdmins(tx, {
      title: `Agent 凭证已签发：${account.name}`,
      content: `${label || credential.credentialKey} 已签发，有效期至 ${expiresAt.toISOString().slice(0, 10)}`,
      metadata: {
        event: 'ISSUED',
        agentAccountId,
        credentialId: credential.id,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      credential: serializeCredential(credential),
      token: material.token,
    };
  });
};

const revokeAgentCredential = async ({ credentialId, prismaClient = prisma } = {}) => {
  return runInTransaction(prismaClient, async (tx) => {
    const credential = await tx.agentCredential.update({
      where: { id: credentialId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
      include: {
        agentAccount: true,
      },
    });

    await notifyAdmins(tx, {
      title: `Agent 凭证已吊销：${credential.agentAccount?.name || credential.agentAccountId}`,
      content: `${credential.label || credential.credentialKey} 已被吊销`,
      metadata: {
        event: 'REVOKED',
        agentAccountId: credential.agentAccountId,
        credentialId: credential.id,
      },
    });

    return credential;
  });
};

const rotateAgentCredential = async ({ credentialId, expiresInDays, prismaClient = prisma } = {}) => {
  return runInTransaction(prismaClient, async (tx) => {
    const existing = await tx.agentCredential.findUnique({
      where: { id: credentialId },
      include: { agentAccount: true },
    });

    if (!existing || !existing.agentAccount || existing.agentAccount.status !== 'ACTIVE') {
      throw createError('待轮换凭证不存在或 Agent 不可用', 404);
    }

    await tx.agentCredential.update({
      where: { id: credentialId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    const activeCount = await tx.agentCredential.count({
      where: {
        agentAccountId: existing.agentAccountId,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });
    if (activeCount >= MAX_ACTIVE_CREDENTIALS_PER_AGENT) {
      throw createError(`活跃凭证已达到上限（${MAX_ACTIVE_CREDENTIALS_PER_AGENT}）`, 400);
    }

    const material = issueCredentialMaterial();
    const expiresAt = resolveExpiresAt(expiresInDays);
    const nextCredential = await tx.agentCredential.create({
      data: {
        agentAccountId: existing.agentAccountId,
        credentialKey: material.credentialKey,
        label: existing.label || null,
        secretHash: material.secretHash,
        secretPreview: material.secretPreview,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    await notifyAdmins(tx, {
      title: `Agent 凭证已轮换：${existing.agentAccount?.name || existing.agentAccountId}`,
      content: `${existing.label || existing.credentialKey} 已轮换，新凭证有效期至 ${expiresAt.toISOString().slice(0, 10)}`,
      metadata: {
        event: 'ROTATED',
        agentAccountId: existing.agentAccountId,
        credentialId: nextCredential.id,
        previousCredentialId: existing.id,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      credential: serializeCredential(nextCredential),
      token: material.token,
    };
  });
};

module.exports = {
  listAgentAccounts,
  getAgentAccountById,
  createAgentAccount,
  updateAgentAccount,
  issueAgentCredential,
  revokeAgentCredential,
  rotateAgentCredential,
};
