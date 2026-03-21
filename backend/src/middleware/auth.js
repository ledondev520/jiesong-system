/**
 * Input: JWT Token, 用户角色
 * Output: 认证/授权结果
 * Pos: 认证授权中间件，保护API路由
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const { createError } = require('./errorHandler');
const { roleAuth, adminOnly } = require('./roleAuth');
const prisma = require('../utils/prisma');

/**
 * 认证用户信息内存缓存（LRU 简化实现）
 * - Key: userId（string）
 * - Value: { user, expiresAt }
 * - TTL: 60s（与 JWT 有效期相比极短，仅用于降低 DB 频率）
 * - 容量: 1000 条（超出按 FIFO 淘汰）
 *
 * 安全说明：
 *   用户被禁用（isActive=false）时，最多延迟 60s 才失效。
 *   如需即时踢出，可在禁用时调用 clearAuthCache(userId)。
 */
const AUTH_CACHE_TTL_MS = 60 * 1000;
const AUTH_CACHE_MAX_SIZE = 1000;
const authCache = new Map();

const getCachedUser = (userId) => {
  const entry = authCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    authCache.delete(userId);
    return null;
  }
  return entry.user;
};

const setCachedUser = (userId, user) => {
  // 简单 FIFO 淘汰：超过容量时删最旧的 key
  if (authCache.size >= AUTH_CACHE_MAX_SIZE) {
    const oldestKey = authCache.keys().next().value;
    if (oldestKey) authCache.delete(oldestKey);
  }
  authCache.set(userId, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
};

/**
 * 职责：主动清除某用户的认证缓存（适用于禁用/修改角色等场景）
 * @param {string} userId
 */
const clearAuthCache = (userId) => {
  if (userId) authCache.delete(userId);
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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('未提供认证Token', 401);
    }
    
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
    
    // 3. 查询用户（优先读缓存，降低 DB 频率）
    let user = getCachedUser(decoded.userId);

    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        throw createError('用户不存在', 401);
      }

      if (!user.isActive) {
        // 被禁用的用户不写入缓存，每次都打 DB 确保即时拦截
        throw createError('用户已被禁用', 401);
      }

      setCachedUser(decoded.userId, user);
    }

    if (!user.isActive) {
      clearAuthCache(decoded.userId);
      throw createError('用户已被禁用', 401);
    }
    
    // 4. 附加用户信息
    req.user = user;
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
