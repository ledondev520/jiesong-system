const prisma = require('../../utils/prisma');
const { success, paginated } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { normalizePagination } = require('../../utils/pagination');

const parseOptionalText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const parseDate = (value, options = {}) => {
  const text = parseOptionalText(value);
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (options.endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
};

const buildOperationLogWhere = (query = {}) => {
  const userId = parseOptionalText(query.userId);
  const entity = parseOptionalText(query.entity);
  const action = parseOptionalText(query.action);
  const entityId = parseOptionalText(query.entityId);
  const ipAddress = parseOptionalText(query.ipAddress);
  const keyword = parseOptionalText(query.keyword);
  const startDate = parseDate(query.startDate);
  const endDate = parseDate(query.endDate, { endOfDay: true });

  if (query.startDate && !startDate) {
    throw createError('startDate 格式错误，需为 ISO 日期或 YYYY-MM-DD', 400);
  }
  if (query.endDate && !endDate) {
    throw createError('endDate 格式错误，需为 ISO 日期或 YYYY-MM-DD', 400);
  }
  if (startDate && endDate && startDate > endDate) {
    throw createError('startDate 不能晚于 endDate', 400);
  }

  const where = {};
  if (userId) where.userId = userId;
  if (entity) where.entity = entity;
  if (action) where.action = action;
  if (entityId) where.entityId = entityId;
  if (ipAddress) where.ipAddress = { contains: ipAddress, mode: 'insensitive' };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      where.createdAt.lte = endDate;
    }
  }

  if (keyword) {
    where.OR = [
      { action: { contains: keyword, mode: 'insensitive' } },
      { entity: { contains: keyword, mode: 'insensitive' } },
      { entityId: { contains: keyword, mode: 'insensitive' } },
      { oldValue: { contains: keyword, mode: 'insensitive' } },
      { newValue: { contains: keyword, mode: 'insensitive' } },
      { ipAddress: { contains: keyword, mode: 'insensitive' } },
      { user: { is: { name: { contains: keyword, mode: 'insensitive' } } } },
      { user: { is: { username: { contains: keyword, mode: 'insensitive' } } } },
    ];
  }

  return where;
};

const csvEscape = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const buildOperationLogCsv = (logs = []) => {
  const headers = [
    'ID',
    '时间',
    '用户ID',
    '用户名',
    '姓名',
    '动作',
    '实体',
    '实体ID',
    'IP地址',
    'UserAgent',
    '修改前',
    '修改后',
  ];

  const rows = logs.map((item) => ([
    item.id,
    item.createdAt ? new Date(item.createdAt).toISOString() : '',
    item.userId,
    item.user?.username || '',
    item.user?.name || '',
    item.action,
    item.entity,
    item.entityId || '',
    item.ipAddress || '',
    item.userAgent || '',
    item.oldValue || '',
    item.newValue || '',
  ]));

  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((row) => row.map(csvEscape).join(','));
  return [headerLine, ...dataLines].join('\n');
};

const getNotifications = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { unreadOnly } = req.query;
    const keyword = parseOptionalText(req.query.keyword);

    const where = { userId: req.user.id };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    if (keyword) {
      where.OR = ['title', 'content', 'type'].map((field) => ({ [field]: { contains: keyword } }));
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

const getOperationLogs = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 50, maxPageSize: 200 });
    const where = buildOperationLogWhere(req.query);

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

const exportOperationLogsCsv = async (req, res, next) => {
  try {
    const where = buildOperationLogWhere(req.query);
    const maxRows = 20000;
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxRows)
      : 5000;

    const logs = await prisma.operationLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const csv = `\uFEFF${buildOperationLogCsv(logs)}`;
    const now = new Date().toISOString().replace(/[:]/g, '-');
    const filename = `operation_logs_${now}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  getLogs: getOperationLogs,
  getOperationLogs,
  exportOperationLogsCsv,
};
