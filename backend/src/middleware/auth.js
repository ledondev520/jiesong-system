/**
 * Input: JWT Bearer、HttpOnly浏览器会话、用户角色
 * Output: 实时用户状态与会话版本认证/授权结果
 * Pos: 认证授权中间件，保护API路由
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const jwt = require('jsonwebtoken');
const browserSessions = require('../services/browserSessionService');
const config = require('../config');
const { createError } = require('./errorHandler');
const { enforceBossReadOnly } = require('./bossReadOnly');
const { roleAuth, adminOnly } = require('./roleAuth');
const prisma = require('../utils/prisma');

// Authentication state is read from SQLite on every request, across all workers.
// Retain the exported invalidation API for existing user-management callers.
const clearAuthCache = () => {};

const attachUserActor = (req, user) => {
  req.user = user;
  req.authActor = {
    actorType: 'USER',
    userId: user.id,
    agentAccountId: null,
    agentCredentialId: null,
  };
};

/**
 * 职责：验证JWT Token，将用户信息附加到请求对象
 * 思路：
 * 1. 从Authorization头提取Token
 * 2. 验证Token有效性
 * 3. 查询用户是否存在且激活
 * 4. 附加用户信息到req.user
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {NextFunction} next - 下一个中间件
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. 获取Token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      attachUserActor(req, await browserSessions.authenticate(req));
      enforceBossReadOnly(req);
      return next();
    }
    // An explicit malformed/expired bearer must never fall back to another identity.
    if (!/^Bearer \S+$/.test(authHeader)) throw createError('无效的Token', 401);
    
    const token = authHeader.split(' ')[1];

    // 2. 验证Token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw createError('Token已过期', 401);
      }
      throw createError('无效的Token', 401);
    }
    
    // Live reads are required for immediate revocation; cached versions permit old JWTs.
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, name: true, role: true, isActive: true, sessionVersion: true },
    });
    if (!user) throw createError('用户不存在', 401);
    if (!user.isActive) throw createError('用户已被禁用', 401);
    // Pre-migration JWTs have version 0; the first password change permanently revokes them.
    const version = decoded.sessionVersion === undefined ? 0 : decoded.sessionVersion;
    if (!Number.isSafeInteger(version) || version < 0 || version !== user.sessionVersion) {
      throw createError('登录已失效，请重新登录', 401);
    }
    const { sessionVersion: _version, ...publicUser } = user;

    // 4. 附加用户信息
    attachUserActor(req, publicUser);
    enforceBossReadOnly(req);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  clearAuthCache,
  roleAuth,
  adminOnly,
};
