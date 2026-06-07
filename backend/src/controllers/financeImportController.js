/**
 * Input: HTTP请求、financeImportService
 * Output: 银行流水/发票导入的API响应
 * Pos: 财务数据导入控制器
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const multer = require('multer');
const financeImportService = require('../services/financeImportService');
const { success, error } = require('../utils/response');

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname) ||
      [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ].includes(file.mimetype);
    cb(null, ok);
  },
});

/**
 * 职责：预览银行对账单解析结果
 */
async function previewBankFlow(req, res, next) {
  try {
    if (!req.file) return error(res, '请上传文件', 400);
    const { bankType } = req.body;
    const result = financeImportService.parseBankStatement(req.file.buffer, bankType || 'GENERIC');
    success(res, {
      preview: result.records.slice(0, 10),
      mapping: result.previewMapping,
      totalRows: result.totalRows,
      validRows: result.records.length,
      errorRows: result.errors.length,
      errors: result.errors.slice(0, 20),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 职责：批量导入银行对账单
 */
async function importBankFlow(req, res, next) {
  try {
    if (!req.file) return error(res, '请上传文件', 400);
    const { bankType } = req.body;
    const parseResult = financeImportService.parseBankStatement(req.file.buffer, bankType || 'GENERIC');

    if (parseResult.records.length === 0) {
      return error(res, '未能解析到有效数据', 400, { errors: parseResult.errors });
    }

    const importResult = await financeImportService.importBankTransactions(
      parseResult.records,
      req.file.originalname,
      req.user?.id || 'system'
    );

    success(res, {
      ...importResult,
      parseErrors: parseResult.errors,
      preview: parseResult.records.slice(0, 5),
    }, `成功导入 ${importResult.success} 条银行流水`);
  } catch (err) {
    next(err);
  }
}

/**
 * 职责：预览发票解析结果
 */
async function previewInvoices(req, res, next) {
  try {
    if (!req.file) return error(res, '请上传文件', 400);
    const { invoiceType } = req.body;
    const result = financeImportService.parseInvoices(req.file.buffer, invoiceType || 'all');
    success(res, {
      preview: result.records.slice(0, 10),
      mapping: result.previewMapping,
      totalRows: result.totalRows,
      validRows: result.records.length,
      errorRows: result.errors.length,
      errors: result.errors.slice(0, 20),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 职责：批量导入发票
 */
async function importInvoices(req, res, next) {
  try {
    if (!req.file) return error(res, '请上传文件', 400);
    const { invoiceType } = req.body;
    const parseResult = financeImportService.parseInvoices(req.file.buffer, invoiceType || 'all');

    if (parseResult.records.length === 0) {
      return error(res, '未能解析到有效数据', 400, { errors: parseResult.errors });
    }

    const importResult = await financeImportService.importInvoiceRecords(
      parseResult.records,
      req.file.originalname,
      req.user?.id || 'system'
    );

    success(res, {
      ...importResult,
      parseErrors: parseResult.errors,
      preview: parseResult.records.slice(0, 5),
    }, `成功导入 ${importResult.success} 条发票记录`);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  previewBankFlow,
  importBankFlow,
  previewInvoices,
  importInvoices,
  upload: memoryUpload,
};
