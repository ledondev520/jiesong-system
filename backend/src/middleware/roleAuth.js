/**
 * Input: 当前登录用户、目标路由允许角色
 * Output: 角色授权结果
 * Pos: 角色鉴权中间件，统一处理 RBAC
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

/**
 * A98: the named role sets, in canonical order ADMIN, PURCHASE, SALES, FINANCE, WAREHOUSE, BOSS.
 * Routes use roleAuth(ROLE_SETS.X); a route that needs a different set lists its roles literally.
 */
const ROLE_SETS = Object.freeze({
  ADMIN: Object.freeze(['ADMIN']),
  FINANCE: Object.freeze(['ADMIN', 'FINANCE']), // accounting writes and Restricted finance reads
  FINANCE_READ: Object.freeze(['ADMIN', 'FINANCE', 'BOSS']), // accounting reads incl. the read-only BOSS
  COMMERCIAL: Object.freeze(['ADMIN', 'PURCHASE', 'SALES', 'FINANCE']), // money-seeing operators, no WAREHOUSE (OD-3)
  OPERATORS: Object.freeze(['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE']), // every business writer; BOSS stays read-only
  EVERYONE: Object.freeze(['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']),
});

module.exports = {
  roleAuth,
  adminOnly,
  ROLE_SETS,
};
