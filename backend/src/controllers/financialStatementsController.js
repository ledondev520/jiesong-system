/**
 * Input: HTTP 请求（路由参数、上传工作簿、预览凭证）
 * Output: 财务报表预览、确认写入、查询与分析 JSON 响应
 * Pos: 财务报表 HTTP Adapter；上传工作簿不能绕过预览直接写库
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const financialStatementsService = require('../services/financialStatementsService');

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

const parseUploadPeriod = (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ code: 400, message: '请上传 .xlsx 会计报表' });
    return null;
  }
  const year = parseInt(req.body.year, 10);
  const month = parseInt(req.body.month, 10);
  if (Number.isNaN(year) || year < 2000 || year > 2099 || Number.isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ code: 400, message: '年份或月份参数无效（年份 2000~2099，月份 1~12）' });
    return null;
  }
  return {
    year,
    month,
    periodLabel: req.body.periodLabel?.trim() || `${year}年${month}账期`,
  };
};

const sendStatementError = (res, err, action) => {
  console.error(`[financialStatements] ${action} error:`, err);
  const status = Number(err?.statusCode || err?.status || 500);
  return res.status(status).json({ code: status, message: err.message });
};

/** 只读解析上传文件，返回关键科目、平衡校验和覆盖风险，不写数据库。 */
const previewFile = async (req, res) => {
  const period = parseUploadPeriod(req, res);
  if (!period) return undefined;
  try {
    const preview = await financialStatementsService.previewFromBuffer(
      req.file.buffer,
      period.year,
      period.month,
      period.periodLabel,
    );
    return res.json({
      code: 200,
      message: preview.ready ? '解析完成，请核对后确认写入' : '解析完成，但存在阻塞项',
      data: preview,
    });
  } catch (err) {
    return sendStatementError(res, err, 'previewFile');
  }
};

/** 使用同一文件与预览凭证确认写入；同账期覆盖必须显式勾选。 */
const confirmFile = async (req, res) => {
  const period = parseUploadPeriod(req, res);
  if (!period) return undefined;
  try {
    const result = await financialStatementsService.confirmImportFromBuffer(
      req.file.buffer,
      period.year,
      period.month,
      period.periodLabel,
      {
        previewId: String(req.body.previewId || '').trim(),
        allowOverwrite: req.body.allowOverwrite === 'true' || req.body.allowOverwrite === true,
      },
    );
    return res.json({
      code: 200,
      message: result.overwritten
        ? `${period.periodLabel} 已确认覆盖更新`
        : `${period.periodLabel} 已确认写入`,
      data: result,
    });
  } catch (err) {
    return sendStatementError(res, err, 'confirmFile');
  }
};

module.exports = {
  previewFile,
  confirmFile,
  listStatements,
  getStatementDetail,
  getAnalytics,
};
