/**
 * Input: 用户请求数据
 * Output: 用户管理响应
 * Pos: 用户控制器，处理用户CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const bcrypt = require('bcrypt');
const { success, paginated } = require('../utils/response');

/**
 * 职责：获取用户列表
 */
const list = async (req, res) => {
  const { page = 1, pageSize = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(pageSize);
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: parseInt(pageSize),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count(),
  ]);
  
  paginated(res, users, total, parseInt(page), parseInt(pageSize));
};

/**
 * 职责：获取单个用户
 */
const getById = async (req, res) => {
  const { id } = req.params;
  
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  }
  
  success(res, user);
};

/**
 * 职责：创建用户
 */
const create = async (req, res) => {
  const { username, password, name, role } = req.body;
  
  // 0. 检查用户名是否已存在
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(400).json({ code: 400, message: '用户名已存在', data: null });
  }
  
  // 1. 密码加密
  const hashedPassword = await bcrypt.hash(password, 12);
  
  // 2. 创建用户
  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      name,
      role: role || 'SALES',
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  
  success(res, user, '用户创建成功', 201);
};

/**
 * 职责：更新用户
 */
const update = async (req, res) => {
  const { id } = req.params;
  const { name, role, isActive, password } = req.body;
  
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (role !== undefined) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (password) updateData.password = await bcrypt.hash(password, 12);
  
  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });
  
  success(res, user, '用户更新成功');
};

/**
 * 职责：删除用户
 */
const remove = async (req, res) => {
  const { id } = req.params;
  
  // 不允许删除自己
  if (req.user.id === id) {
    return res.status(400).json({ code: 400, message: '不能删除自己', data: null });
  }
  
  await prisma.user.delete({ where: { id } });
  
  success(res, null, '用户已删除');
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
