/**
 * Input: 用户请求数据
 * Output: 用户管理响应
 * Pos: 用户控制器，处理用户CRUD操作
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { clearAuthCache } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { success, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取用户列表
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 10 });
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          avatar: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    paginated(res, users, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取单个用户
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        avatar: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw createError('用户不存在', 404);
    }

    success(res, user);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建用户
 */
const create = async (req, res, next) => {
  try {
    const { username, password, name, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw createError('用户名已存在', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
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
        avatar: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    success(res, user, '用户创建成功', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新用户
 */
const update = async (req, res, next) => {
  try {
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
        avatar: true,
        isActive: true,
        lastLoginAt: true,
        updatedAt: true,
      },
    });

    clearAuthCache(id);
    success(res, user, '用户更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除用户
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user && req.user.id === id) {
      throw createError('不能删除自己', 400);
    }

    await prisma.user.delete({ where: { id } });
    success(res, null, '用户已删除');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
