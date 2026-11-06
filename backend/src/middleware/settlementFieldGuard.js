/**
 * Input: 税务模块 POST/PUT 请求体、当前用户角色
 * Output: 非 ADMIN/FINANCE 角色试图写入结算类字段/状态时返回 403
 * Pos: 退税/外汇核销写路由守卫，防止 SALES 通过通用 CRUD 直接把记录置为已退税/已核销
 */

const { createError } = require('./errorHandler');

// 空值/0 视为未设置：前端表单会带上默认的 0/空串，不算越权
const isSet = (body, key) => Boolean(body && body[key]) && Number(body[key]) !== 0;
const hasKey = (body, key) => body && Object.prototype.hasOwnProperty.call(body, key);

/** @param {{ safeStatuses: string[], fields: string[] }} options */
const settlementFieldGuard = ({ safeStatuses, fields }) => (req, res, next) => {
  if (['ADMIN', 'FINANCE'].includes(req.user?.role)) return next();
  const body = req.body || {};
  const badStatus = hasKey(body, 'status') && !safeStatuses.includes(body.status);
  if (badStatus || fields.some((field) => isSet(body, field))) {
    return next(createError('仅管理员或财务可修改结算状态与金额', 403));
  }
  next();
};

module.exports = { settlementFieldGuard };
