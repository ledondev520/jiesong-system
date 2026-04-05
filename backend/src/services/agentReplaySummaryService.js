/**
 * Input: prisma、replay profile
 * Output: Agent replay summary 持久化与读取服务
 * Pos: 后端服务层
 */

const prisma = require('../utils/prisma');

const parseJsonSafely = (value) => {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};

const buildReplaySummaryRecord = ({
  userId,
  sessionId,
  governanceReplayProfile,
}) => ({
  userId,
  sessionId,
  source: 'replay-summary-record',
  level: governanceReplayProfile?.level || 'none',
  summaryJson: JSON.stringify(governanceReplayProfile?.summary || {}),
  countsJson: JSON.stringify(governanceReplayProfile?.counts || {}),
  evidenceJson: JSON.stringify(governanceReplayProfile?.evidence || {}),
  profileJson: JSON.stringify({
    ...(governanceReplayProfile || {}),
    source: 'replay-summary-record',
  }),
});

const upsertReplaySummary = async ({
  userId,
  sessionId,
  governanceReplayProfile,
}) => {
  if (!prisma.agentReplaySummary?.upsert) return null;
  const record = buildReplaySummaryRecord({
    userId,
    sessionId,
    governanceReplayProfile,
  });
  return prisma.agentReplaySummary.upsert({
    where: {
      userId_sessionId: {
        userId,
        sessionId,
      },
    },
    update: record,
    create: record,
  });
};

const buildReplaySummaryProfileMap = async (userId, sessionIds = []) => {
  const uniqueIds = Array.from(new Set((Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean)));
  if (!userId || uniqueIds.length === 0 || !prisma.agentReplaySummary?.findMany) return new Map();

  const rows = await prisma.agentReplaySummary.findMany({
    where: {
      userId,
      sessionId: { in: uniqueIds },
    },
    select: {
      sessionId: true,
      profileJson: true,
    },
  });

  const map = new Map();
  rows.forEach((row) => {
    const profile = parseJsonSafely(row.profileJson);
    if (!profile) return;
    map.set(row.sessionId, {
      profile,
      source: 'replay-summary-record',
    });
  });

  return map;
};

module.exports = {
  buildReplaySummaryRecord,
  upsertReplaySummary,
  buildReplaySummaryProfileMap,
};
