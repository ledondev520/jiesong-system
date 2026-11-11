/**
 * Input: 当前登录用户、目标路由允许角色
 * Output: 角色授权结果
 * Pos: 角色鉴权中间件，统一处理 RBAC
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { createError } = require('./errorHandler');

/**
 * 职责：检查当前用户是否具备访问角色
 * @param {...string} roles - 允许访问的角色
 * @returns {import('express').RequestHandler} Express中间件
 */
const roleAuth = (...roles) => {
  const allowedRoles = roles.flat().filter(Boolean);

  const middleware = (req, res, next) => {
    if (!req.user) {
      return next(createError('请先登录', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(createError('无权限执行此操作', 403));
    }

    next();
  };

  // 供测试与路由巡检使用
  middleware.isRoleAuth = true;
  middleware.allowedRoles = allowedRoles;

  return middleware;
};

const adminOnly = roleAuth('ADMIN');

module.exports = {
  roleAuth,
  adminOnly,
};
