/**
 * Input: HTTP请求、dataImportService
 * Output: 数据导入相关的API响应
 * Pos: 数据导入控制器，处理CSV上传、解析、对比、导入请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const dataImportService = require('../services/dataImportService');
const { success, error } = require('../utils/response');

/**
 * 职责：解析并预览CSV文件，返回对比结果
 * @param {Request} req - 包含CSV文件
 * @param {Response} res - 返回对比结果
 */
const previewImport = async (req, res, next) => {
  try {
    // 0. 检查文件上传
    if (!req.file) {
      return error(res, 'CSV文件未上传', 400);
    }
    
    // 1. 解析CSV内容
    const csvContent = req.file.buffer.toString('utf-8');
    const parsed = dataImportService.parseCSV(csvContent);
    
    if (parsed.errors.length > 0) {
      return error(res, 'CSV解析错误', 400, parsed.errors);
    }
    
    // 2. 分析数据（找出缺失序号）
    const analysis = dataImportService.analyzeData(parsed.data);
    
    // 3. 与数据库对比
    const comparison = await dataImportService.compareWithDatabase(parsed.data);
    
    // 4. 返回预览结果
    success(res, {
      fileName: req.file.originalname,
      analysis,
      comparison: {
        summary: comparison.summary,
        newRecords: comparison.newRecords.slice(0, 50), // 只返回前50条预览
        existingRecords: comparison.existingRecords.slice(0, 20),
        invalidRecords: comparison.invalidRecords,
      },
      fullNewRecords: comparison.newRecords, // 全部新记录用于导入
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 职责：执行数据导入
 * @param {Request} req - 包含要导入的记录
 * @param {Response} res - 返回导入结果
 */
const executeImport = async (req, res, next) => {
  try {
    const { records } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return error(res, '没有需要导入的记录', 400);
    }
    
    // 执行导入
    const result = await dataImportService.importRecords(records);
    
    success(res, {
      message: `成功导入 ${result.success.length} 条记录`,
      result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 职责：获取导入历史记录
 */
const getHistory = async (req, res, next) => {
  try {
    const history = await dataImportService.getImportHistory();
    success(res, history);
  } catch (err) {
    next(err);
  }
};

/**
 * 职责：获取数据库当前统计
 */
const getStats = async (req, res, next) => {
  try {
    const stats = await dataImportService.getDatabaseStats();
    success(res, stats);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  previewImport,
  executeImport,
  getHistory,
  getStats,
};
