const prisma = require('../../utils/prisma');
const { success, paginated } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { normalizePagination } = require('../../utils/pagination');

const getNotifications = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { unreadOnly } = req.query;

    const where = { userId: req.user.id };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });

    paginated(res, notifications, total, page, pageSize, { unreadCount });
  } catch (error) {
    next(error);
  }
};

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

const getLogs = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 50, maxPageSize: 200 });
    const { userId, entity, action } = req.query;

    const where = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip,
        take: pageSize,
        include: { user: { select: { id: true, name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.operationLog.count({ where }),
    ]);

    paginated(res, logs, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  getLogs,
};
