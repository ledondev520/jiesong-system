/**
 * Input: HTTP 请求（路由参数/请求体）
 * Output: 财务报表数据 JSON 响应
 * Pos: 财务报表控制器，处理导入、查询、分析请求
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const financialStatementsService = require('../services/financialStatementsService');

/**
 * 职责：触发从本地文件夹批量导入所有账期
 * POST /api/v1/finance/statements/import-folder
 */
const importFromFolder = async (req, res) => {
  try {
    const result = await financialStatementsService.importFromFolder();
    return res.json({
      code: 200,
      message: `导入完成：成功 ${result.imported} 个账期，跳过 ${result.skipped} 个`,
      data: result,
    });
  } catch (err) {
    console.error('[financialStatements] importFromFolder error:', err);
    return res.status(500).json({ code: 500, message: err.message });
  }
};

/**
 * 职责：获取所有账期列表（含摘要指标）
 * GET /api/v1/finance/statements
 */
const listStatements = async (req, res) => {
  try {
    const periods = await financialStatementsService.listPeriods();
    return res.json({ code: 200, message: 'ok', data: periods });
  } catch (err) {
    console.error('[financialStatements] listStatements error:', err);
    return res.status(500).json({ code: 500, message: err.message });
  }
};

/**
 * 职责：获取指定年月的完整财务详情
 * GET /api/v1/finance/statements/:year/:month
 * @param req.params.year - 年份（如 2025）
 * @param req.params.month - 月份（如 6）
 */
const getStatementDetail = async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ code: 400, message: '年份或月份参数无效' });
    }
    const data = await financialStatementsService.getPeriodDetail(year, month);
    if (!data) {
      return res.status(404).json({ code: 404, message: '未找到该账期数据' });
    }
    return res.json({ code: 200, message: 'ok', data });
  } catch (err) {
    console.error('[financialStatements] getStatementDetail error:', err);
    return res.status(500).json({ code: 500, message: err.message });
  }
};

/**
 * 职责：获取趋势分析数据和预警列表
 * GET /api/v1/finance/statements/analytics
 */
const getAnalytics = async (req, res) => {
  try {
    const data = await financialStatementsService.getAnalytics();
    return res.json({ code: 200, message: 'ok', data });
  } catch (err) {
    console.error('[financialStatements] getAnalytics error:', err);
    return res.status(500).json({ code: 500, message: err.message });
  }
};

/**
 * 职责：接收上传的 Excel 文件，解析并导入指定账期
 * POST /api/v1/finance/statements/import-file
 * @param req.file - multer 上传的文件对象（buffer 存在于 req.file.buffer）
 * @param req.body.year - 账期年份（必填）
 * @param req.body.month - 账期月份（必填）
 * @param req.body.periodLabel - 账期标签（选填，默认为 "${year}年${month}账期"）
 */
const importFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请上传 Excel 文件' });
    }
    const year = parseInt(req.body.year);
    const month = parseInt(req.body.month);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ code: 400, message: '年份或月份参数无效（month 须在 1~12）' });
    }
    const periodLabel = req.body.periodLabel?.trim() || `${year}年${month}账期`;
    const result = await financialStatementsService.importFromBuffer(req.file.buffer, year, month, periodLabel);
    return res.json({
      code: 200,
      message: `导入完成：${periodLabel} 已成功写入数据库`,
      data: result,
    });
  } catch (err) {
    console.error('[financialStatements] importFile error:', err);
    return res.status(500).json({ code: 500, message: err.message });
  }
};

module.exports = {
  importFromFolder,
  importFile,
  listStatements,
  getStatementDetail,
  getAnalytics,
};
