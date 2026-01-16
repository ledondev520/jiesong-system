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
const prisma = require('../utils/prisma');

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
    
    // 3. 查询用户
    const user = await prisma.user.findUnique({
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
      throw createError('用户已被禁用', 401);
    }
    
    // 4. 附加用户信息
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：检查用户是否具有指定角色
 * 思路：返回中间件函数，检查req.user.role是否在允许列表中
 * @param {...string} roles - 允许的角色列表
 * @returns {Function} Express中间件
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(createError('请先登录', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(createError('无权限执行此操作', 403));
    }
    
    next();
  };
};

/**
 * 职责：仅允许管理员访问
 */
const adminOnly = authorize('ADMIN');

module.exports = {
  authenticate,
  authorize,
  adminOnly,
};
