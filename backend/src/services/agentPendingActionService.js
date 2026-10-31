/**
 * Input: Agent 写工具产生的待确认操作
 * Output: 跨进程共享（SQLite）的待确认操作存取与原子抢占
 * Pos: openAgentService 的持久层；确认只允许 `pending -> executing` 抢占成功的一方执行
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * - 过期在 DB 层判断（expiresAt），清理在创建时惰性执行，不使用进程内定时器，N 个进程都安全。
 * - 进程在 executing 时崩溃：记录保持 executing 直到过期，宁可不执行也不重复执行。
 */
const prisma = require('../utils/prisma');

const PENDING_ACTION_TTL_MS = 30 * 60 * 1000;

const toRecord = (row) => (row ? { ...row, params: JSON.parse(row.params) } : null);

const unexpired = () => ({ expiresAt: { gt: new Date() } });

const createPendingRecord = async ({ userId, actionType, params, description }) => {
  const id = `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // 惰性清理：过期记录已不可确认，审计留在 operationLog
  await prisma.agentPendingAction.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  await prisma.agentPendingAction.create({
    data: {
      id,
      userId,
      actionType,
      params: JSON.stringify(params ?? {}),
      description,
      expiresAt: new Date(Date.now() + PENDING_ACTION_TTL_MS),
    },
  });
  return id;
};

/** 过期视为不存在 */
const getPendingRecord = async (id) => toRecord(await prisma.agentPendingAction.findFirst({
  where: { id, ...unexpired() },
}));

const attachSession = (ids, sessionId) => (ids.length
  ? prisma.agentPendingAction.updateMany({ where: { id: { in: ids } }, data: { sessionId } })
  : null);

/** 原子抢占：仅返回 true 的一方可执行 */
const claimPending = async (id, userId) => {
  const { count } = await prisma.agentPendingAction.updateMany({
    where: { id, userId, status: 'pending', ...unexpired() },
    data: { status: 'executing' },
  });
  return count === 1;
};

const finishClaimed = (id, status, failureReason = null) => prisma.agentPendingAction.updateMany({
  where: { id, status: 'executing' },
  data: { status, failureReason },
});

const cancelPending = async (id, userId) => {
  const { count } = await prisma.agentPendingAction.updateMany({
    where: { id, userId, status: 'pending', ...unexpired() },
    data: { status: 'cancelled' },
  });
  return count === 1;
};

module.exports = {
  PENDING_ACTION_TTL_MS,
  createPendingRecord,
  getPendingRecord,
  attachSession,
  claimPending,
  finishClaimed,
  cancelPending,
};
