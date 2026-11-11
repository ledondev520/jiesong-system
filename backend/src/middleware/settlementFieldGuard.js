/**
 * Input: 税务模块 POST/PUT 请求体、当前用户角色
 * Output: 非 ADMIN/FINANCE 角色试图写入结算类字段/状态时返回 403
 * Pos: 退税/外汇核销写路由守卫，防止 SALES 通过通用 CRUD 直接把记录置为已退税/已核销
 */

const { createError } = require('./errorHandler');
const prisma = require('../utils/prisma');

// 空值/0 视为未设置：前端表单会带上默认的 0/空串，不算越权
const isSet = (body, key) => Boolean(body && body[key]) && Number(body[key]) !== 0;
const hasKey = (body, key) => body && Object.prototype.hasOwnProperty.call(body, key);

/**
 * @param {{ safeStatuses: string[], fields: string[], model?: string }} options
 * model: prisma delegate name; when set, updates (req.params.id) of records already past safeStatuses are refused for other roles.
 */
const settlementFieldGuard = ({ safeStatuses, fields, model }) => async (req, res, next) => {
  try {
    if (req.user?.role === 'ADMIN') return next();
    const body = req.body || {};
    const badStatus = hasKey(body, 'status') && !safeStatuses.includes(body.status);
    if (badStatus || fields.some((field) => isSet(body, field))) {
      return next(createError('仅管理员或财务可修改结算状态与金额', 403));
    }
    if (model && req.params?.id) {
      const current = await prisma[model].findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (current && !safeStatuses.includes(current.status)) {
        return next(createError('该记录已进入结算状态，仅管理员或财务可修改', 403));
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { settlementFieldGuard };
