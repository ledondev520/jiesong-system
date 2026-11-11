/**
 * Input: 用户请求数据
 * Output: 用户管理响应
 * Pos: 用户控制器，处理用户CRUD操作
 */

const prisma = require('../utils/prisma');
const { clearAuthCache } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const bcrypt = require('bcrypt');
const { assertPassword } = require('../utils/passwordPolicy');
const { success, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const { createError } = require('../middleware/errorHandler');
const { shouldRevokeSessions, revokeBrowserSessions, assertAdminKept } = require('../utils/userSessionRevocation');

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
    if (role !== undefined && !Object.values(ROLES).includes(role)) throw createError('角色无效', 400);

    assertPassword(password);
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
    const { name, role, isActive, password, email, phone } = req.body;
    if (role !== undefined && !Object.values(ROLES).includes(role)) throw createError('角色无效', 400);

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (password !== undefined && password !== '') {
      assertPassword(password);
      updateData.password = await bcrypt.hash(password, 12);
      updateData.sessionVersion = { increment: 1 };
    }

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
      if (!existing) throw createError('用户不存在', 404);
      await assertAdminKept(tx, id, existing, { role, isActive }, req.user?.id);
      // Email is the password-recovery identity (SECURITY.md 找回): any email write ends existing sessions, as the removed PUT /auth/users/:id did.
      const revoke = shouldRevokeSessions(existing, { role, isActive }) || email !== undefined;
      if (revoke) updateData.sessionVersion = { increment: 1 };
      const updated = await tx.user.update({
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
      if (revoke) await revokeBrowserSessions(tx, id);
      return updated;
    });

    clearAuthCache(id);
    success(res, user, '用户更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：停用用户（DELETE 语义改为软停用，保留 OperationLog/PurchaseReceipt 等不可变历史）
 * 不能停用自己，也不能停用最后一个有效 ADMIN；会话立即撤销。
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user && req.user.id === id) {
      throw createError('不能停用自己', 400);
    }

    await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
      if (!target) throw createError('用户不存在', 404);
      if (target.role === 'ADMIN' && target.isActive) {
        const otherAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: id } } });
        if (otherAdmins === 0) throw createError('不能停用最后一个有效管理员', 400);
      }
      await tx.user.update({ where: { id }, data: { isActive: false, sessionVersion: { increment: 1 } } });
      await revokeBrowserSessions(tx, id);
    });
    clearAuthCache(id);
    success(res, null, '用户已停用');
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
