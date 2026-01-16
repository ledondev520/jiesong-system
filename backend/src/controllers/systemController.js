/**
 * Input: Prisma客户端
 * Output: 系统配置相关的HTTP响应
 * Pos: 系统控制器，处理系统配置和日志查询
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, paginated } = require('../utils/response');

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
    
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    
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
    const { page = 1, pageSize = 20 } = req.query;
    
    const result = await importService.getImportRecords(parseInt(page), parseInt(pageSize));
    
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
  importData,
  getImportRecords,
  exportData,
};
