/**
 * Input: HTTP 请求（查询参数 / 上传文件）
 * Output: Excel 文件下载 或 JSON 导入结果
 * Pos: 采购合同批量导入导出控制器
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { exportPurchasesExcel, importPurchasesExcel } = require('../services/purchaseImportExportService');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：导出采购合同 Excel
 * 思路：从查询参数提取筛选条件，调用服务生成 Excel，设置响应头后直接发送 Buffer
 */
const exportExcel = async (req, res, next) => {
  try {
    const { status, supplierId, dateFrom, dateTo } = req.query;
    const result = await exportPurchasesExcel({ status, supplierId, dateFrom, dateTo });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：批量导入采购合同 Excel
 * 思路：校验上传文件，调用服务解析 Excel 并写入数据库，返回导入统计
 */
const importExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      throw createError('请选择要导入的 Excel 文件', 400);
    }

    const result = await importPurchasesExcel(req.file.path, req.user?.id);
    success(res, result, `导入完成：成功 ${result.successRows} 条，失败 ${result.failedRows} 条`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  exportExcel,
  importExcel,
};
