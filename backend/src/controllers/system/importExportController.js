/**
 * Input: HTTP请求、exportService
 * Output: 数据导出（CSV）响应
 * Pos: /export/:type 的控制器；导入与 PDF 导出已移除
 */

const { BANK_ROLES } = require('../../agent/commands/supplier/bankFields');

const exportData = async (req, res, next) => {
  try {
    const { type } = req.params;
    const exportService = require('../../services/exportService');

    const result = await exportService.exportData(type, req.query, { includeBank: BANK_ROLES.includes(req.user?.role), includeMoney: req.user?.role === 'ADMIN' });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  exportData,
};
