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

const parseCapability = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const [resource, action] = normalized.split('.');
  if (!resource || !action) {
    return null;
  }
  return { resource, action };
};

const capabilityAuth = (...capabilities) => {
  const required = capabilities.flat().map(parseCapability).filter(Boolean);

  return (req, res, next) => {
    if (req.authActor?.actorType === 'AGENT') {
      const allowed = hasCapabilities(req.agent, required);

      if (!allowed) {
        return next(createError('Agent 无权限执行此操作', 403));
      }
      return next();
    }

    if (!req.user) {
      return next(createError('请先登录', 401));
    }

    return next();
  };
};

const hasCapabilities = (agent, capabilities) => {
  const grants = Array.isArray(agent?.grants) ? agent.grants : [];
  return capabilities.every((need) =>
    grants.some((grant) => grant.resource === need.resource && grant.action === need.action)
  );
};

const accessAuth = ({ roles = [], capabilities = [] } = {}) => {
  const roleMiddleware = roles.length ? roleAuth(...roles) : null;
  const capabilityMiddleware = capabilities.length ? capabilityAuth(...capabilities) : null;

  return (req, res, next) => {
    if (req.authActor?.actorType === 'AGENT') {
      if (!capabilityMiddleware) {
        return next(createError('Agent 无权限执行此操作', 403));
      }
      return capabilityMiddleware(req, res, next);
    }

    if (roleMiddleware) {
      return roleMiddleware(req, res, next);
    }

    if (!req.user) {
      return next(createError('请先登录', 401));
    }

    return next();
  };
};

module.exports = {
  roleAuth,
  adminOnly,
  capabilityAuth,
  accessAuth,
  parseCapability,
  hasCapabilities,
};
