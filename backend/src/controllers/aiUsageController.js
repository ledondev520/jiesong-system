/**
 * Input: HTTP请求（用量趋势、调用明细、汇总）
 * Output: JSON响应
 * Pos: AI用量统计Controller，查询前校验日期并复用统一分页边界
 */

const aiUsageService = require('../services/aiUsageService');
const { normalizePagination } = require('../utils/pagination');

class AiUsageController {
  async getUsageTrend(req, res) {
    try {
      const { dateFrom, dateTo, groupBy } = req.query;
      if ([dateFrom, dateTo].some((value) => value !== undefined && (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())))) {
        return res.status(400).json({ code: 400, message: '日期参数无效' });
      }
      const data = await aiUsageService.getUsageTrend({ dateFrom, dateTo, groupBy });
      res.json({ code: 200, data });
    } catch (error) {
      console.error('获取AI用量趋势失败:', error);
      res.status(500).json({ code: 500, message: '获取用量趋势失败' });
    }
  }

  async getCallDetails(req, res) {
    try {
      const { page, pageSize } = normalizePagination(req.query);
      const { userId, action, status } = req.query;
      const data = await aiUsageService.getCallDetails({ page, pageSize, userId, action, status });
      res.json({ code: 200, data });
    } catch (error) {
      console.error('获取AI调用明细失败:', error);
      res.status(500).json({ code: 500, message: '获取调用明细失败' });
    }
  }

  async getUsageSummary(req, res) {
    try {
      const data = await aiUsageService.getUsageSummary();
      res.json({ code: 200, data });
    } catch (error) {
      console.error('获取AI用量汇总失败:', error);
      res.status(500).json({ code: 500, message: '获取用量汇总失败' });
    }
  }
}

module.exports = new AiUsageController();
