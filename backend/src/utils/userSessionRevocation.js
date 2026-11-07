/**
 * Input: 事务客户端、用户当前状态与拟更新字段
 * Output: 角色变更/停用时递增 sessionVersion 并撤销该用户全部浏览器会话
 * Pos: authService.updateUser 与 userController.update/remove 共用，避免两套入口口径漂移
 */

const { createError } = require('../middleware/errorHandler');

/** 角色变化或被停用时，旧令牌/Cookie 必须立即失效。 */
const shouldRevokeSessions = (existing, { role, isActive } = {}) => (
  (role !== undefined && role !== existing.role)
  || (isActive === false && existing.isActive !== false)
);

/** 在调用方事务内删除该用户全部 BrowserSession（sessionVersion 递增由调用方写入 update data）。 */
const revokeBrowserSessions = (tx, userId) => tx.browserSession.deleteMany({ where: { userId } });

/**
 * 停用/降级一个有效 ADMIN 时：不能是自己，也不能是最后一个有效 ADMIN（与 DELETE /users 同一规则）。
 * 在调用方事务内执行；SQLite 写入串行，竞态时事务失败即拒绝（fail closed）。
 */
const assertAdminKept = async (tx, id, existing, { role, isActive } = {}, actorId) => {
  const losesAdmin = existing.role === 'ADMIN' && existing.isActive
    && ((role !== undefined && role !== 'ADMIN') || isActive === false);
  if (!losesAdmin) return;
  if (actorId && actorId === id) throw createError('不能停用或降级自己', 400);
  const otherAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: id } } });
  if (otherAdmins === 0) throw createError('不能停用或降级最后一个有效管理员', 400);
};

module.exports = { shouldRevokeSessions, revokeBrowserSessions, assertAdminKept };
