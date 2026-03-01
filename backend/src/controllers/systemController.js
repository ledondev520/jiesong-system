/**
 * Input: Prisma客户端
 * Output: 系统配置相关的HTTP响应
 * Pos: 系统控制器，处理系统配置和日志查询
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取系统配置
 */
const getConfigs = async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    
    // 转换为键值对格式
    const formatted = configs.reduce((acc, config) => {
      try {
        acc[config.key] = JSON.parse(config.value);
      } catch {
        acc[config.key] = config.value;
      }
      return acc;
    }, {});
    
    success(res, formatted);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新系统配置
 */
const updateConfig = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, note } = req.body;
    
    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value: JSON.stringify(value), note },
      create: { key, value: JSON.stringify(value), note },
    });
    
    success(res, config, '配置更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取操作日志
 */
const getLogs = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 50, userId, entity, action } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = action;
    
    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { user: { select: { id: true, name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.operationLog.count({ where }),
    ]);
    
    paginated(res, logs, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取通知列表
 */
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, unreadOnly } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = { userId: req.user.id };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }
    
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);
    
    // 获取未读数量
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });
    
    res.json({
      code: 200,
      message: '获取成功',
      data: {
        items: notifications,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / parseInt(pageSize)),
        },
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：标记通知已读
 */
const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { isRead: true },
    });

    if (result.count === 0) {
      return next(createError('通知不存在或无权限访问', 404));
    }

    success(res, null, '已标记为已读');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取当前汇率
 */
const getExchangeRate = async (req, res, next) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'exchangeRate' },
    });
    
    let rate = { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 };
    if (config) {
      try {
        const parsed = JSON.parse(config.value);
        rate = {
          ...parsed,
          effectiveRate: parsed.rate - (parsed.buffer || 0.2),
        };
      } catch {}
    }
    
    success(res, rate);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取港口列表（支持分页/关键词）
 */
const getPorts = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 100, keyword, includeInactive = 'false' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where = {};
    if (includeInactive !== 'true') {
      where.isActive = true;
    }
    if (typeof keyword === 'string' && keyword.trim()) {
      where.OR = [
        { name: { contains: keyword.trim(), mode: 'insensitive' } },
        { code: { contains: keyword.trim(), mode: 'insensitive' } },
      ];
    }

    const [ports, total] = await Promise.all([
      prisma.port.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { name: 'asc' },
      }),
      prisma.port.count({ where }),
    ]);

    paginated(res, ports, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建港口
 */
const createPort = async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const code = (req.body.code || '').trim().toUpperCase();
    const isActive = req.body.isActive !== false;

    const duplicated = await prisma.port.findFirst({
      where: {
        OR: [{ name }, { code }],
      },
      select: { id: true, name: true, code: true },
    });
    if (duplicated) {
      throw createError('港口名称或代码已存在', 400);
    }

    const port = await prisma.port.create({
      data: { name, code, isActive },
    });

    created(res, port, '港口创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新港口
 */
const updatePort = async (req, res, next) => {
  try {
    const { id } = req.params;
    const name = req.body.name === undefined ? undefined : String(req.body.name).trim();
    const code = req.body.code === undefined ? undefined : String(req.body.code).trim().toUpperCase();
    const isActive = req.body.isActive;

    const existing = await prisma.port.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw createError('港口不存在', 404);
    }

    if (name || code) {
      const duplicated = await prisma.port.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(name ? [{ name }] : []),
            ...(code ? [{ code }] : []),
          ],
        },
        select: { id: true },
      });
      if (duplicated) {
        throw createError('港口名称或代码已存在', 400);
      }
    }

    const port = await prisma.port.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    success(res, port, '港口更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除港口（软删除）
 */
const removePort = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.port.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw createError('港口不存在', 404);
    }

    await prisma.port.update({
      where: { id },
      data: { isActive: false },
    });

    success(res, null, '港口已停用');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取商品分类列表（支持分页/关键词）
 */
const getCategories = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 100, keyword } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where = {};
    if (typeof keyword === 'string' && keyword.trim()) {
      where.name = { contains: keyword.trim(), mode: 'insensitive' };
    }

    const [categories, total] = await Promise.all([
      prisma.productCategory.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: {
          parent: { select: { id: true, name: true } },
          _count: {
            select: {
              children: true,
              products: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.productCategory.count({ where }),
    ]);

    paginated(res, categories, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建商品分类
 */
const createCategory = async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const parentId = typeof req.body.parentId === 'string' && req.body.parentId.trim()
      ? req.body.parentId.trim()
      : null;

    if (parentId) {
      const parent = await prisma.productCategory.findUnique({ where: { id: parentId }, select: { id: true } });
      if (!parent) {
        throw createError('父级分类不存在', 400);
      }
    }

    const category = await prisma.productCategory.create({
      data: { name, parentId },
      include: { parent: { select: { id: true, name: true } } },
    });

    created(res, category, '商品分类创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新商品分类
 */
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.productCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw createError('商品分类不存在', 404);
    }

    const name = req.body.name === undefined ? undefined : String(req.body.name).trim();
    let parentId = req.body.parentId;
    if (parentId === '') {
      parentId = null;
    }

    if (parentId === id) {
      throw createError('父级分类不能选择自己', 400);
    }

    if (parentId !== undefined && parentId !== null) {
      const parent = await prisma.productCategory.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) {
        throw createError('父级分类不存在', 400);
      }
    }

    const category = await prisma.productCategory.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
      include: { parent: { select: { id: true, name: true } } },
    });

    success(res, category, '商品分类更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除商品分类（需无子分类、无商品引用）
 */
const removeCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.productCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw createError('商品分类不存在', 404);
    }

    const [childCount, productCount] = await Promise.all([
      prisma.productCategory.count({ where: { parentId: id } }),
      prisma.product.count({ where: { categoryId: id } }),
    ]);

    if (childCount > 0) {
      throw createError('请先删除子分类后再删除当前分类', 400);
    }
    if (productCount > 0) {
      throw createError('该分类下仍有关联商品，无法删除', 400);
    }

    await prisma.productCategory.delete({ where: { id } });
    success(res, null, '商品分类删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：导入CSV数据
 * 思路：
 * 1. 接收上传的CSV文件
 * 2. 调用导入服务处理数据
 * 3. 返回导入结果
 */
const importData = async (req, res, next) => {
  try {
    const importService = require('../services/importService');
    
    if (!req.file) {
      throw new Error('请选择要导入的CSV文件');
    }
    
    const result = await importService.importCSVData(req.file.path, req.user.id);
    
    success(res, result, `导入完成：成功${result.successRows}条，失败${result.failedRows}条`);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取导入记录列表
 */
const getImportRecords = async (req, res, next) => {
  try {
    const importService = require('../services/importService');
    const { page = 1, pageSize = 20, status, keyword } = req.query;
    
    const result = await importService.getImportRecords(parseInt(page), parseInt(pageSize), {
      status: typeof status === 'string' && status.trim() ? status.trim() : undefined,
      keyword: typeof keyword === 'string' && keyword.trim() ? keyword.trim() : undefined,
    });
    
    res.json({
      code: 200,
      message: '获取成功',
      data: {
        items: result.records,
        pagination: {
          total: result.total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(result.total / parseInt(pageSize)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：导出数据
 */
const exportData = async (req, res, next) => {
  try {
    const { type } = req.params;
    const exportService = require('../services/exportService');
    
    const result = await exportService.exportData(type, req.query);
    
    // 设置响应头
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConfigs,
  updateConfig,
  getLogs,
  getNotifications,
  markNotificationRead,
  getExchangeRate,
  getPorts,
  createPort,
  updatePort,
  removePort,
  getCategories,
  createCategory,
  updateCategory,
  removeCategory,
  importData,
  getImportRecords,
  exportData,
};
