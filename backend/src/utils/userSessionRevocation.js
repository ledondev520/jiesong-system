/**
 * Input: 事务客户端、用户当前状态与拟更新字段
 * Output: 角色变更/停用时递增 sessionVersion 并撤销该用户全部浏览器会话
 * Pos: authService.updateUser 与 userController.update/remove 共用，避免两套入口口径漂移
 */

/** 角色变化或被停用时，旧令牌/Cookie 必须立即失效。 */
const shouldRevokeSessions = (existing, { role, isActive } = {}) => (
  (role !== undefined && role !== existing.role)
  || (isActive === false && existing.isActive !== false)
);

/** 在调用方事务内删除该用户全部 BrowserSession（sessionVersion 递增由调用方写入 update data）。 */
const revokeBrowserSessions = (tx, userId) => tx.browserSession.deleteMany({ where: { userId } });

module.exports = { shouldRevokeSessions, revokeBrowserSessions };
