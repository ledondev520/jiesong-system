/**
 * Input: 通知服务
 * Output: 通知相关的 HTTP 响应
 * Pos: 通知控制器，处理有统一分页边界的通知列表、已读、生成逻辑
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const notificationService = require('../services/notificationService');
const { success, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');

/**
 * 职责：获取当前用户通知列表
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize } = normalizePagination(req.query, { maxPageSize: 100 });
    const result = await notificationService.list(req.user.id, { page, pageSize });
    paginated(res, result.items, result.total, result.page, result.pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取当前用户未读通知数量
 */
const unreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.unreadCount(req.user.id);
    success(res, { count });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：标记单条通知已读
 */
const markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await notificationService.markRead(req.user.id, id);
    if (!notification) {
      return res.status(404).json({ code: 404, message: '通知不存在', data: null });
    }
    success(res, notification);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：标记全部通知已读
 */
const markAllRead = async (req, res, next) => {
  try {
    await notificationService.markAllRead(req.user.id);
    success(res, null, '已全部标记为已读');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：为当前用户生成通知（在登录或查看仪表盘时调用）
 */
const generate = async (req, res, next) => {
  try {
    const notifications = await notificationService.generateForUser(req.user.id);
    success(res, { generated: notifications.length });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  generate,
};
