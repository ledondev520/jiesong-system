/**
 * Input: AI 调用日志查询参数
 * Output: 用量统计、调用明细、汇总数据
 * Pos: AI 用量统计服务层
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class AiUsageService {
  /**
   * 按日期聚合的用量趋势
   */
  async getUsageTrend({ dateFrom, dateTo, groupBy = 'day' }) {
    const logs = await prisma.aiUsageLog.findMany({
      where: {
        createdAt: {
          gte: dateFrom ? new Date(dateFrom) : undefined,
          lte: dateTo ? new Date(dateTo) : undefined,
        },
        status: 'SUCCESS',
      },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map();
    for (const log of logs) {
      const key = groupBy === 'day'
        ? log.createdAt.toISOString().slice(0, 10)
        : log.createdAt.toISOString().slice(0, 7);
      const entry = grouped.get(key) || { date: key, calls: 0, tokens: 0, promptTokens: 0, completionTokens: 0 };
      entry.calls += 1;
      entry.tokens += log.totalTokens;
      entry.promptTokens += log.promptTokens;
      entry.completionTokens += log.completionTokens;
      grouped.set(key, entry);
    }

    return Array.from(grouped.values());
  }

  /**
   * 调用明细列表（分页）
   */
  async getCallDetails({ page = 1, pageSize = 20, userId, action, status }) {
    const where = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.aiUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.aiUsageLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * 用量汇总（今日/本周/本月）
   */
  async getUsageSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, week, month, total] = await Promise.all([
      prisma.aiUsageLog.aggregate({
        where: { createdAt: { gte: todayStart }, status: 'SUCCESS' },
        _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
        _count: true,
      }),
      prisma.aiUsageLog.aggregate({
        where: { createdAt: { gte: weekStart }, status: 'SUCCESS' },
        _sum: { totalTokens: true },
        _count: true,
      }),
      prisma.aiUsageLog.aggregate({
        where: { createdAt: { gte: monthStart }, status: 'SUCCESS' },
        _sum: { totalTokens: true },
        _count: true,
      }),
      prisma.aiUsageLog.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { totalTokens: true },
        _count: true,
      }),
    ]);

    return {
      today: { calls: today._count, tokens: today._sum.totalTokens || 0 },
      week: { calls: week._count, tokens: week._sum.totalTokens || 0 },
      month: { calls: month._count, tokens: month._sum.totalTokens || 0 },
      total: { calls: total._count, tokens: total._sum.totalTokens || 0 },
    };
  }

  /**
   * 记录一次 AI 调用
   */
  async logUsage({ userId, userName, action, model, promptTokens, completionTokens, totalTokens, durationMs, status, errorMessage, metadata }) {
    return prisma.aiUsageLog.create({
      data: {
        userId,
        userName,
        action,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        durationMs,
        status,
        errorMessage,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }
}

module.exports = new AiUsageService();
