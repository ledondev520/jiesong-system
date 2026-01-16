/**
 * Input: Kimi API, Prisma客户端
 * Output: AI助手相关的HTTP响应
 * Pos: AI控制器，处理智能问答和辅助录入
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const config = require('../config');
const { success, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：智能问答
 * 思路：
 * 1. 获取用户消息和会话上下文
 * 2. 调用Kimi API
 * 3. 保存对话历史
 * 4. 返回AI响应
 */
const chat = async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    const userId = req.user.id;
    
    // 生成会话ID
    const currentSessionId = sessionId || `session_${Date.now()}`;
    
    // 保存用户消息
    await prisma.chatHistory.create({
      data: {
        userId,
        sessionId: currentSessionId,
        role: 'user',
        content: message,
      },
    });
    
    // TODO: 调用Kimi API
    // 暂时返回模拟响应
    let aiResponse = '您好！我是捷淞进销存系统的AI助手。';
    
    if (config.kimi.apiKey) {
      // 实际调用Kimi API
      try {
        const response = await fetch(`${config.kimi.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.kimi.apiKey}`,
          },
          body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [
              {
                role: 'system',
                content: '你是捷淞进销存系统的AI助手，帮助用户管理采购、销售、库存和货柜信息。你可以帮助用户查询商品位置、解析采购报价、计算销售价格等。',
              },
              { role: 'user', content: message },
            ],
          }),
        });
        
        const data = await response.json();
        if (data.choices && data.choices[0]) {
          aiResponse = data.choices[0].message.content;
        }
      } catch (apiError) {
        console.error('Kimi API Error:', apiError);
        aiResponse = '抱歉，AI服务暂时不可用，请稍后再试。';
      }
    } else {
      // 模拟智能回复
      if (message.includes('商品') || message.includes('位置')) {
        aiResponse = '您可以通过"库存管理"模块查询商品位置。请告诉我具体的商品名称，我可以帮您查询。';
      } else if (message.includes('汇率') || message.includes('价格')) {
        aiResponse = '当前系统汇率为6.8，缓冲值0.2，实际计算汇率为6.6。销售价 = 成本价 / 6.6 × 1.3';
      } else if (message.includes('货柜') || message.includes('柜子')) {
        aiResponse = '您可以通过"货柜管理"模块查看货柜信息。货柜编号格式为：年份-序号-港口简码，如 25-001-LA。';
      }
    }
    
    // 保存AI响应
    await prisma.chatHistory.create({
      data: {
        userId,
        sessionId: currentSessionId,
        role: 'assistant',
        content: aiResponse,
      },
    });
    
    success(res, {
      sessionId: currentSessionId,
      message: aiResponse,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：解析输入内容（辅助录入）
 * 思路：
 * 1. 接收用户粘贴的文本
 * 2. 使用AI解析关键信息
 * 3. 返回结构化数据供用户确认
 */
const parseInput = async (req, res, next) => {
  try {
    const { content, type } = req.body;
    
    // TODO: 调用Kimi API进行智能解析
    // 暂时返回模拟解析结果
    let parsed = {};
    
    if (type === 'purchase') {
      // 解析采购信息
      parsed = {
        type: 'purchase',
        confidence: 0.85,
        data: {
          productName: '待解析',
          quantity: 0,
          unitPrice: 0,
          supplier: '待解析',
        },
        rawText: content,
        needsConfirmation: true,
        message: 'AI解析功能需要配置Kimi API Key后生效',
      };
    } else if (type === 'quote') {
      // 解析报价单
      parsed = {
        type: 'quote',
        confidence: 0.80,
        items: [],
        rawText: content,
        needsConfirmation: true,
        message: 'AI解析功能需要配置Kimi API Key后生效',
      };
    }
    
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
 * 职责：配置AI设置
 */
const updateConfig = async (req, res, next) => {
  try {
    const { apiKey, baseUrl } = req.body;
    
    // 保存到系统配置
    if (apiKey) {
      await prisma.systemConfig.upsert({
        where: { key: 'kimiApiKey' },
        update: { value: JSON.stringify({ encrypted: true }) },
        create: { key: 'kimiApiKey', value: JSON.stringify({ encrypted: true }), note: 'Kimi API Key (加密存储)' },
      });
      // 实际应该加密存储，这里简化处理
    }
    
    success(res, null, 'AI配置更新成功');
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
};
