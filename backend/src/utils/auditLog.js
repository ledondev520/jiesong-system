/**
 * Input: Prisma客户端、请求对象
 * Output: 操作日志记录
 * Pos: 审计日志工具，记录用户操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('./prisma');

/**
 * 职责：记录操作日志
 * @param {Object} params - 日志参数
 * @param {string} params.userId - 用户ID
 * @param {string} params.action - 操作类型 (CREATE/UPDATE/DELETE/LOGIN等)
 * @param {string} params.entity - 操作实体 (User/Supplier/Product等)
 * @param {string} params.entityId - 实体ID
 * @param {Object} params.oldValue - 修改前的值
 * @param {Object} params.newValue - 修改后的值
 * @param {Object} params.req - Express请求对象
 */
const logOperation = async ({
  userId,
  action,
  entity,
  entityId = null,
  oldValue = null,
  newValue = null,
  req = null,
}) => {
  try {
    await prisma.operationLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        ipAddress: req?.ip || req?.connection?.remoteAddress || null,
        userAgent: req?.headers?.['user-agent'] || null,
      },
    });
  } catch (error) {
    // 日志记录失败不应影响主业务
    console.error('操作日志记录失败:', error.message);
  }
};

/**
 * 职责：创建审计日志中间件
 * 思路：包装controller方法，自动记录操作
 * @param {string} entity - 实体名称
 * @param {string} action - 操作类型
 * @returns {Function} 中间件函数
 */
const auditMiddleware = (entity, action) => {
  return (originalHandler) => {
    return async (req, res, next) => {
      // 保存原始的res.json方法
      const originalJson = res.json.bind(res);
      
      // 重写res.json以便捕获响应
      res.json = async (data) => {
        // 只在成功操作时记录日志
        if (data.code >= 200 && data.code < 300 && req.user) {
          await logOperation({
            userId: req.user.id,
            action,
            entity,
            entityId: req.params?.id || data.data?.id,
            newValue: ['CREATE', 'UPDATE'].includes(action) ? data.data : null,
            req,
          });
        }
        return originalJson(data);
      };
      
      // 调用原始处理器
      return originalHandler(req, res, next);
    };
  };
};

/**
 * 职责：快捷日志记录方法
 */
const log = {
  create: (userId, entity, entityId, newValue, req) => 
    logOperation({ userId, action: 'CREATE', entity, entityId, newValue, req }),
  
  update: (userId, entity, entityId, oldValue, newValue, req) =>
    logOperation({ userId, action: 'UPDATE', entity, entityId, oldValue, newValue, req }),
  
  delete: (userId, entity, entityId, oldValue, req) =>
    logOperation({ userId, action: 'DELETE', entity, entityId, oldValue, req }),
  
  login: (userId, req) =>
    logOperation({ userId, action: 'LOGIN', entity: 'User', entityId: userId, req }),
  
  logout: (userId, req) =>
    logOperation({ userId, action: 'LOGOUT', entity: 'User', entityId: userId, req }),
};

module.exports = {
  logOperation,
  auditMiddleware,
  log,
};
