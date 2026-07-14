/**
 * Input: 已认证的财务资料库查询参数
 * Output: 脱敏资料摘要、文档列表与 Sheet 行级下钻 JSON
 * Pos: 财务资料库 HTTP Adapter；路由只允许 ADMIN/FINANCE 角色访问
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const financialEvidenceService = require('../services/financialEvidenceService');

const sendError = (res, error, action) => {
  console.error(`[financialEvidence] ${action} error:`, error);
  return res.status(500).json({ code: 500, message: '财务资料查询失败' });
};

const getSummary = async (_req, res) => {
  try {
    const data = await financialEvidenceService.getFinancialEvidenceSummary();
    return res.json({ code: 200, message: 'ok', data });
  } catch (error) {
    return sendError(res, error, 'getSummary');
  }
};

const listDocuments = async (req, res) => {
  try {
    const data = await financialEvidenceService.listFinancialEvidenceDocuments(req.query);
    return res.json({ code: 200, message: 'ok', data });
  } catch (error) {
    return sendError(res, error, 'listDocuments');
  }
};

const getDocument = async (req, res) => {
  try {
    const data = await financialEvidenceService.getFinancialEvidenceDocument(req.params.id, req.query);
    if (!data) return res.status(404).json({ code: 404, message: '未找到该财务资料' });
    return res.json({ code: 200, message: 'ok', data });
  } catch (error) {
    return sendError(res, error, 'getDocument');
  }
};

module.exports = { getSummary, listDocuments, getDocument };
