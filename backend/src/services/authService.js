/**
 * Input: Prisma客户端、JWT、bcrypt
 * Output: 认证相关业务逻辑（登录、注册、密码管理、找回密码）
 * Pos: 认证服务，处理用户认证和授权逻辑
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { clearAuthCache } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');
const { log: auditLog } = require('../utils/auditLog');

/**
 * 职责：用户登录验证并生成Token
 * 思路：
 * 1. 查找用户
 * 2. 验证密码
 * 3. 生成JWT Token
 * 4. 更新最后登录时间
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Object} { token, user }
 */
const login = async (username, password) => {
  // 1. 查找用户
  const user = await prisma.user.findUnique({ where: { username } })
    || (username.includes('@') ? await prisma.user.findUnique({ where: { username: username.toLowerCase() } }) : null);
  
  if (!user) {
    throw createError('用户名或密码错误', 401);
  }
  
  if (!user.isActive) {
    throw createError('账号尚未开通或已停用，请联系管理员审核', 401);
  }
  
  // 2. 验证密码
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw createError('用户名或密码错误', 401);
  }
  
  // 3. 生成Token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  
  // 4. 更新最后登录时间
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  
  // 5. 返回结果（排除密码）
  const { password: _, ...userWithoutPassword } = user;
  return {
    token,
    user: userWithoutPassword,
  };
};

/**
 * 职责：创建新用户（管理员创建）
 * 思路：
 * 1. 检查用户名是否已存在
 * 2. 加密密码
 * 3. 创建用户记录
 * @param {Object} userData - 用户数据
 * @returns {Object} 创建的用户（不含密码）
 */
const register = async (userData) => {
  const { username, password, name, role = 'SALES', email, phone } = userData;
  if (!Object.values(ROLES).includes(role)) throw createError('角色无效', 400);
  
  // 1. 检查用户名
  const existing = await prisma.user.findUnique({
    where: { username },
  });
  
  if (existing) {
    throw createError('用户名已存在', 400);
  }
  
  // 2. 加密密码
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // 3. 创建用户
  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      name,
      role,
      email,
      phone,
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
  });
  
  return user;
};

/** 邮箱验证后创建待审核账号；所有自助注册共用同一验证入口。 */
const publicRegister = (userData) => require('./emailRegistrationService').register(userData);

/**
 * 职责：根据ID获取用户信息
 * @param {string} id - 用户ID
 * @returns {Object} 用户信息
 */
const getUserById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      avatar: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  
  if (!user) {
    throw createError('用户不存在', 404);
  }
  
  return user;
};

/**
 * 职责：修改用户密码
 * @param {string} userId - 用户ID
 * @param {string} oldPassword - 旧密码
 * @param {string} newPassword - 新密码
 */
const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user) {
    throw createError('用户不存在', 404);
  }
  
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw createError('原密码错误', 400);
  }
  
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

/**
 * 职责：获取用户列表（分页）
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Object} { users, total }
 */
const getUsers = async (page = 1, pageSize = 20) => {
  const skip = (page - 1) * pageSize;
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: pageSize,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        email: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ]);
  
  return { users, total };
};

/**
 * 职责：更新用户信息
 * @param {string} id - 用户ID
 * @param {Object} userData - 更新数据
 * @returns {Object} 更新后的用户
 */
const updateUser = async (id, userData) => {
  const { name, role, email, phone, isActive } = userData;
  if (role !== undefined && !Object.values(ROLES).includes(role)) throw createError('角色无效', 400);
  
  const user = await prisma.user.update({
    where: { id },
    data: {
      name,
      role,
      email,
      phone,
      isActive,
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
  });
  
  clearAuthCache(id);
  return user;
};

/**
 * 职责：验证用户身份并重置密码（找回密码功能）
 * 思路：
 * 1. 通过用户名查找用户
 * 2. 验证手机号是否匹配
 * 3. 验证通过后更新密码
 * @param {string} username - 用户名
 * @param {string} phone - 注册时绑定的手机号
 * @param {string} newPassword - 新密码
 * @returns {Object} 操作结果
 */
const verifyAndResetPassword = async (username, phone, newPassword) => {
  // 1. 查找用户
  const user = await prisma.user.findUnique({
    where: { username },
  });
  
  if (!user) {
    throw createError('用户名不存在', 404);
  }
  
  // 2. 验证手机号
  if (!user.phone || user.phone !== phone) {
    throw createError('手机号与注册信息不匹配', 400);
  }
  
  // 3. 检查账号状态
  if (!user.isActive) {
    throw createError('该账号已被禁用，请联系管理员', 403);
  }
  
  // 4. 加密新密码并更新
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });
  
  // 5. 记录操作日志
  await auditLog.action(user.id, 'RESET_PASSWORD', 'User', user.id, null, null);
  
  return { username: user.username, name: user.name };
};

module.exports = {
  login,
  register,
  publicRegister,
  getUserById,
  changePassword,
  getUsers,
  updateUser,
  verifyAndResetPassword,
};
