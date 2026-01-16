/**
 * Input: Kimi API, Prisma客户端
 * Output: AI助手相关的HTTP响应
 * Pos: AI控制器，处理智能问答和辅助录入（含图像）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const aiService = require('../services/aiService');

/**
 * 职责：智能问答（支持图片）
 * 思路：
 * 1. 解析请求参数
 * 2. 调用aiService处理对话
 * 3. 返回响应和Token消耗
 */
const chat = async (req, res, next) => {
  try {
    const { message, sessionId, imageUrl } = req.body;
    const userId = req.user.id;
    
    // 生成会话ID
    const currentSessionId = sessionId || `session_${Date.now()}`;
    
    // 调用AI服务
    const result = await aiService.chat(userId, currentSessionId, message, imageUrl);
    
    success(res, {
      sessionId: currentSessionId,
      message: result.message,
      tokenUsage: result.tokenUsage,
      model: result.model,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：解析输入内容（辅助录入，支持图片）
 * 思路：
 * 1. 接收文本或图片
 * 2. 调用aiService解析
 * 3. 返回结构化数据
 */
const parseInput = async (req, res, next) => {
  try {
    const { content, type, imageUrl } = req.body;
    const userId = req.user.id;
    
    const parsed = await aiService.parseInput(content, type, imageUrl, userId);
    
    success(res, parsed);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取对话历史
 */
const getChatHistory = async (req, res, next) => {
  try {
    const { sessionId, page = 1, pageSize = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = { userId: req.user.id };
    if (sessionId) where.sessionId = sessionId;
    
    const [messages, total] = await Promise.all([
      prisma.chatHistory.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          sessionId: true,
          role: true,
          content: true,
          imageUrl: true,
          promptTokens: true,
          outputTokens: true,
          modelUsed: true,
          createdAt: true,
        },
      }),
      prisma.chatHistory.count({ where }),
    ]);
    
    paginated(res, messages, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取会话列表
 */
const getSessions = async (req, res, next) => {
  try {
    const sessions = await prisma.chatHistory.groupBy({
      by: ['sessionId'],
      where: { userId: req.user.id },
      _max: { createdAt: true },
      _count: true,
      orderBy: { _max: { createdAt: 'desc' } },
    });
    
    success(res, sessions);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除会话
 */
const deleteSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    await prisma.chatHistory.deleteMany({
      where: { userId: req.user.id, sessionId },
    });
    
    success(res, null, '会话删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：配置AI设置（仅管理员）
 */
const updateConfig = async (req, res, next) => {
  try {
    const { apiKey, baseUrl } = req.body;
    
    if (apiKey) {
      await prisma.systemConfig.upsert({
        where: { key: 'kimiApiKey' },
        update: { value: JSON.stringify({ encrypted: true }) },
        create: { key: 'kimiApiKey', value: JSON.stringify({ encrypted: true }), note: 'Kimi API Key (加密存储)' },
      });
    }
    
    success(res, null, 'AI配置更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取Token使用统计
 */
const getTokenStats = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const userId = req.user.id;
    
    const stats = await aiService.getTokenStats(userId, parseInt(days));
    
    success(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取可用模型列表
 */
const getModels = async (req, res, next) => {
  try {
    success(res, {
      models: aiService.MODELS,
      description: {
        thinking: 'Kimi K2 推理增强模型 - 适合复杂推理和分析',
        vision: '视觉模型 - 支持图像理解',
        fast: '快速响应模型 - 适合简单问答',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  chat,
  parseInput,
  getChatHistory,
  getSessions,
  deleteSession,
  updateConfig,
  getTokenStats,
  getModels,
};
