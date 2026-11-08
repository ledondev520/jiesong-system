/**
 * Input: 导出类型参数与登录角色
 * Output: WAREHOUSE 导出付款记录时 403
 * Pos: /system/export/:type 与兼容层 /export/:type 共用，避免任何一条路径绕过
 */
const { createError } = require('./errorHandler');

// 付款流水属账务读取：WAREHOUSE 无任何账务读权限（与 routes/finance.js 一致）
const paymentsExportGuard = (req, res, next) => (
  req.params.type === 'payments' && req.user?.role === 'WAREHOUSE'
    ? next(createError('无权导出付款记录', 403))
    : next()
);

module.exports = { paymentsExportGuard };
