const prisma = require('../utils/prisma');
const { NOTIFICATION_TYPE, ROLES } = require('../config/constants');

const DEFAULT_WARNING_DAYS = 14;

const toTodayStart = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const safeParseMetadata = (metadata) => {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
};

const buildAlertTitle = (alert) => (
  alert.severity === 'critical'
    ? `Agent 凭证已过期：${alert.agentName}`
    : `Agent 凭证即将到期：${alert.agentName}`
);

const buildAlertContent = (alert) => (
  alert.severity === 'critical'
    ? `${alert.credentialLabel} 已过期，请立即轮换或吊销`
    : `${alert.credentialLabel} 将在 ${alert.daysRemaining} 天后到期，请尽快轮换`
);

const listAgentCredentialAlerts = async (tx = prisma, options = {}) => {
  const checkedAt = options.checkedAt instanceof Date ? options.checkedAt : new Date();
  const warningDays = Number.isFinite(options.warningDays) ? options.warningDays : DEFAULT_WARNING_DAYS;
  const threshold = new Date(checkedAt);
  threshold.setDate(threshold.getDate() + warningDays);

  const credentials = await tx.agentCredential.findMany({
    where: {
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: { not: null, lte: threshold },
    },
    include: {
      agentAccount: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: { expiresAt: 'asc' },
  });

  const alerts = credentials.map((credential) => {
    const diffDays = Math.ceil((new Date(credential.expiresAt).getTime() - checkedAt.getTime()) / (24 * 60 * 60 * 1000));
    const severity = diffDays < 0 ? 'critical' : 'warning';
    const event = diffDays < 0 ? 'EXPIRED' : 'EXPIRING_SOON';
    return {
      credentialId: credential.id,
      agentAccountId: credential.agentAccountId,
      agentName: credential.agentAccount?.name || credential.agentAccountId,
      credentialLabel: credential.label || credential.credentialKey,
      severity,
      event,
      checkedAt: checkedAt.toISOString(),
      expiresAt: credential.expiresAt.toISOString(),
      daysRemaining: diffDays,
    };
  });

  return {
    alerts,
    checkedAt: checkedAt.toISOString(),
  };
};

const createAgentCredentialNotifications = async (tx = prisma, alerts = [], options = {}) => {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return { created: 0, skipped: 0, recipients: 0 };
  }

  const admins = await tx.user.findMany({
    where: {
      isActive: true,
      role: ROLES.ADMIN,
    },
    select: { id: true },
  });

  if (!admins.length) {
    return { created: 0, skipped: alerts.length, recipients: 0 };
  }

  const todayStart = options.todayStart instanceof Date ? options.todayStart : toTodayStart();
  const existing = await tx.notification.findMany({
    where: {
      type: NOTIFICATION_TYPE.AGENT_CREDENTIAL,
      userId: { in: admins.map((admin) => admin.id) },
      createdAt: { gte: todayStart },
    },
    select: { userId: true, metadata: true },
  });

  const existingKeys = new Set();
  existing.forEach((item) => {
    const metadata = safeParseMetadata(item.metadata);
    if (metadata?.credentialId && metadata?.event) {
      existingKeys.add(`${item.userId}:${metadata.credentialId}:${metadata.event}`);
    }
  });

  const rows = [];
  alerts.forEach((alert) => {
    admins.forEach((admin) => {
      const dedupeKey = `${admin.id}:${alert.credentialId}:${alert.event}`;
      if (existingKeys.has(dedupeKey)) return;
      rows.push({
        userId: admin.id,
        type: NOTIFICATION_TYPE.AGENT_CREDENTIAL,
        title: buildAlertTitle(alert),
        content: buildAlertContent(alert),
        metadata: JSON.stringify(alert),
      });
    });
  });

  if (rows.length) {
    await tx.notification.createMany({ data: rows });
  }

  return {
    created: rows.length,
    skipped: alerts.length * admins.length - rows.length,
    recipients: admins.length,
  };
};

const runDailyAgentCredentialAlertCheck = async (tx = prisma, options = {}) => {
  const { alerts, checkedAt } = await listAgentCredentialAlerts(tx, options);
  const notificationResult = await createAgentCredentialNotifications(tx, alerts, options);
  return {
    checkedAt,
    alertCount: alerts.length,
    ...notificationResult,
  };
};

module.exports = {
  listAgentCredentialAlerts,
  createAgentCredentialNotifications,
  runDailyAgentCredentialAlertCheck,
};
