/**
 * Input: Kimi API、Prisma客户端
 * Output: AI对话和解析结果
 * Pos: AI服务，处理智能问答和辅助录入（含图像理解）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const config = require('../config');
const prisma = require('../utils/prisma');

const OpenAI = require('openai');

// Kimi K2模型配置
const MODELS = {
  default: 'kimi-k2-turbo-preview', // 默认模型
  vision: 'moonshot-v1-128k-vision-preview', // 视觉模型
  fast: 'moonshot-v1-8k', // 快速响应模型
};

// 初始化OpenAI客户端（用于流式调用）
const getOpenAIClient = () => {
  if (!config.kimi.apiKey) return null;
  return new OpenAI({
    apiKey: config.kimi.apiKey,
    baseURL: config.kimi.baseUrl,
  });
};

/**
 * 职责：调用Kimi API进行对话（支持图像）
 * 思路：
 * 1. 构建系统提示词
 * 2. 获取对话历史
 * 3. 调用Kimi API
 * 4. 记录Token消耗
 * 5. 保存对话记录
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {string} message - 用户消息
 * @param {string} imageUrl - 图片URL（可选）
 * @returns {Object} AI响应
 */
const chat = async (userId, sessionId, message, imageUrl = null) => {
  // 0. 获取历史对话（最近10条）
  const history = await prisma.chatHistory.findMany({
    where: { userId, sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  
  // 1. 构建消息列表
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...history.map(h => buildMessageFromHistory(h)),
  ];
  
  // 2. 构建当前用户消息
  const userMessage = buildUserMessage(message, imageUrl);
  messages.push(userMessage);
  
  // 3. 选择模型（有图片用视觉模型，否则用默认模型）
  const model = imageUrl ? MODELS.vision : MODELS.default;
  
  // 4. 保存用户消息
  await prisma.chatHistory.create({
    data: { userId, sessionId, role: 'user', content: message, imageUrl },
  });
  
  // 5. 调用Kimi API
  let aiResponse = '';
  let tokenUsage = { promptTokens: 0, outputTokens: 0 };
  
  if (config.kimi.apiKey) {
    const result = await callKimiAPI(messages, model);
    aiResponse = result.content;
    tokenUsage = result.tokenUsage;
  } else {
    aiResponse = await generateLocalResponse(message);
  }
  
  // 6. 记录Token消耗
  if (tokenUsage.promptTokens > 0) {
    await recordTokenUsage(userId, sessionId, model, tokenUsage, 'chat');
  }
  
  // 7. 保存AI响应
  await prisma.chatHistory.create({
    data: {
      userId,
      sessionId,
      role: 'assistant',
      content: aiResponse,
      promptTokens: tokenUsage.promptTokens,
      outputTokens: tokenUsage.outputTokens,
      modelUsed: model,
    },
  });
  
  return {
    message: aiResponse,
    sessionId,
    tokenUsage: {
      prompt: tokenUsage.promptTokens,
      completion: tokenUsage.outputTokens,
      total: tokenUsage.promptTokens + tokenUsage.outputTokens,
    },
    model,
  };
};

/**
 * 职责：流式调用Kimi API进行对话
 * 思路：
 * 1. 构建消息列表
 * 2. 使用流式API调用
 * 3. 逐个chunk返回给调用者
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {string} message - 用户消息
 * @param {string} imageUrl - 图片URL（可选）
 * @param {function} onChunk - 每个chunk的回调函数
 * @returns {Object} 最终结果
 */
const chatStream = async (userId, sessionId, message, imageUrl = null, onChunk) => {
  const client = getOpenAIClient();
  
  // 0. 获取历史对话（最近10条）
  const history = await prisma.chatHistory.findMany({
    where: { userId, sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  
  // 1. 构建消息列表
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    ...history.map(h => buildMessageFromHistory(h)),
  ];
  
  // 2. 构建当前用户消息
  const userMessage = buildUserMessage(message, imageUrl);
  messages.push(userMessage);
  
  // 3. 选择模型
  const model = imageUrl ? MODELS.vision : MODELS.default;
  
  // 4. 保存用户消息
  await prisma.chatHistory.create({
    data: { userId, sessionId, role: 'user', content: message, imageUrl },
  });
  
  // 5. 流式调用Kimi API
  let fullContent = '';
  let tokenUsage = { promptTokens: 0, outputTokens: 0 };
  
  if (client) {
    try {
      // 估算输入Token
      const tokenEstimate = await estimateTokens(messages, model);
      tokenUsage.promptTokens = tokenEstimate.data?.total_tokens || 0;
      
      // 流式调用
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.6,
        stream: true,
      });
      
      // 逐个chunk处理
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          // 调用回调函数发送chunk
          if (onChunk) {
            onChunk(delta.content);
          }
        }
      }
      
      // 估算输出Token
      tokenUsage.outputTokens = Math.ceil(fullContent.length / 2);
      
    } catch (error) {
      console.error('流式调用失败:', error.message);
      fullContent = '抱歉，AI服务暂时不可用，请稍后再试。';
      if (onChunk) onChunk(fullContent);
    }
  } else {
    fullContent = await generateLocalResponse(message);
    if (onChunk) onChunk(fullContent);
  }
  
  // 6. 记录Token消耗
  if (tokenUsage.promptTokens > 0) {
    await recordTokenUsage(userId, sessionId, model, tokenUsage, 'chat_stream');
  }
  
  // 7. 保存AI响应
  await prisma.chatHistory.create({
    data: {
      userId,
      sessionId,
      role: 'assistant',
      content: fullContent,
      promptTokens: tokenUsage.promptTokens,
      outputTokens: tokenUsage.outputTokens,
      modelUsed: model,
    },
  });
  
  return {
    message: fullContent,
    sessionId,
    tokenUsage: {
      prompt: tokenUsage.promptTokens,
      completion: tokenUsage.outputTokens,
      total: tokenUsage.promptTokens + tokenUsage.outputTokens,
    },
    model,
  };
};

/**
 * 职责：从历史记录构建消息
 */
const buildMessageFromHistory = (h) => {
  if (h.imageUrl && h.role === 'user') {
    return {
      role: h.role,
      content: [
        { type: 'text', text: h.content },
        { type: 'image_url', image_url: { url: h.imageUrl } },
      ],
    };
  }
  return { role: h.role, content: h.content };
};

/**
 * 职责：构建用户消息（支持图片）
 */
const buildUserMessage = (message, imageUrl) => {
  if (imageUrl) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: message },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    };
  }
  return { role: 'user', content: message };
};

/**
 * 职责：记录Token消耗
 */
const recordTokenUsage = async (userId, sessionId, model, tokenUsage, requestType) => {
  await prisma.tokenUsage.create({
    data: {
      userId,
      sessionId,
      model,
      promptTokens: tokenUsage.promptTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.promptTokens + tokenUsage.outputTokens,
      requestType,
    },
  });
};

/**
 * 职责：获取系统提示词
 */
const getSystemPrompt = () => {
  return `你是捷淞进销存系统的AI助手，帮助用户管理采购、销售、库存和货柜信息。

你的主要功能：
1. 智能问答：回答关于商品位置、库存状态、合同信息等业务问题
2. 辅助录入：解析用户粘贴的报价单、合同信息，提取关键字段
3. 价格计算：根据成本价、汇率、利润率计算推荐售价
4. 图像识别：识别用户上传的报价单、发票、合同图片，提取信息
5. 业务分析：提供采购、销售数据的分析建议

定价公式：售价(USD) = 成本价(RMB) ÷ (汇率 - 0.2) × 1.3

货柜编号格式：年份-序号-港口简码，如 25-001-LA
采购合同编号：CG + 年份 + 5位序号，如 CG2500001
出口合同编号：EXP + 年份 + 5位序号，如 EXP2500001

请用中文回答，语言简洁专业。当用户上传图片时，请仔细识别图片内容并提取有用信息。`;
};

/**
 * 职责：调用Kimi API（流式调用）
 * 思路：
 * 1. 使用OpenAI SDK进行流式请求
 * 2. 收集所有chunk并拼接完整响应
 * 3. 调用token统计接口获取消耗量
 * @param {Array} messages - 消息列表
 * @param {string} model - 模型名称
 * @returns {Object} { content, tokenUsage }
 */
const callKimiAPI = async (messages, model = MODELS.default) => {
  const client = getOpenAIClient();
  if (!client) {
    return {
      content: '抱歉，AI服务未配置API Key。',
      tokenUsage: { promptTokens: 0, outputTokens: 0 },
    };
  }
  
  try {
    // 1. 使用流式调用
    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.6,
      stream: true,
    });
    
    // 2. 收集所有chunk
    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
      }
    }
    
    // 3. 调用token统计接口估算消耗
    const tokenEstimate = await estimateTokens(messages, model);
    const promptTokens = tokenEstimate.data?.total_tokens || 0;
    
    // 估算输出token（约为输出字符数/2）
    const outputTokens = Math.ceil(fullContent.length / 2);
    
    return {
      content: fullContent || '抱歉，我暂时无法回答这个问题。',
      tokenUsage: {
        promptTokens,
        outputTokens,
      },
    };
  } catch (error) {
    console.error('Kimi API调用失败:', error.message);
    return {
      content: '抱歉，AI服务暂时不可用，请稍后再试。',
      tokenUsage: { promptTokens: 0, outputTokens: 0 },
    };
  }
};

/**
 * 职责：估算Token数量（调用Kimi官方API）
 * @param {Array} messages - 消息列表
 * @param {string} model - 模型名称
 * @returns {Object} Token估算结果 { data: { total_tokens: number } }
 */
const estimateTokens = async (messages, model = MODELS.default) => {
  if (!config.kimi.apiKey) {
    return { data: { total_tokens: 0 } };
  }
  
  try {
    const response = await fetch(`${config.kimi.baseUrl}/tokenizers/estimate-token-count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.kimi.apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    });
    
    if (!response.ok) {
      console.error('Token估算请求失败:', response.status);
      return { data: { total_tokens: 0 } };
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Token估算失败:', error.message);
    return { data: { total_tokens: 0 } };
  }
};

/**
 * 职责：本地生成响应（无API Key时）
 */
const generateLocalResponse = async (message) => {
  const lowerMessage = message.toLowerCase();
  
  // 商品位置查询
  if (lowerMessage.includes('位置') || lowerMessage.includes('在哪')) {
    const products = await prisma.product.findMany({
      where: { customsName: { contains: message.split('位置')[0].trim() } },
      take: 1,
    });
    if (products.length > 0) {
      const inventory = await prisma.inventory.findFirst({
        where: { productId: products[0].id },
        include: { container: true },
      });
      if (inventory?.container) {
        return `${products[0].customsName}目前在货柜${inventory.container.containerNo}中，状态为${inventory.status}。`;
      }
      return `${products[0].customsName}当前状态为${inventory?.status || '未知'}，暂未装柜。`;
    }
    return '未找到相关商品信息。请确认商品名称后重试。';
  }
  
  // 汇率查询
  if (lowerMessage.includes('汇率')) {
    const exchangeConfig = await prisma.systemConfig.findUnique({
      where: { key: 'exchangeRate' },
    });
    if (exchangeConfig) {
      const rate = JSON.parse(exchangeConfig.value);
      return `当前系统汇率为${rate.rate}，缓冲值${rate.buffer || 0.2}，实际计算汇率为${rate.rate - (rate.buffer || 0.2)}。`;
    }
    return '当前系统汇率为6.8，缓冲值0.2，实际计算汇率为6.6。';
  }
  
  // 价格计算
  if (lowerMessage.includes('价格') || lowerMessage.includes('售价')) {
    const numbers = message.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      const cost = parseFloat(numbers[0]);
      const rate = 6.6;
      const sellingPrice = (cost / rate * 1.3).toFixed(2);
      return `成本${cost}元，按汇率6.6、利润率30%计算，推荐售价为 $${sellingPrice} (约$${Math.round(parseFloat(sellingPrice))})`;
    }
    return '请告诉我成本价，我来帮您计算推荐售价。';
  }
  
  // 默认响应
  return `您好！我是捷淞进销存系统的AI助手。我可以帮您：
1. 查询商品位置和库存状态
2. 计算推荐售价
3. 解析报价单和合同信息（支持图片）
4. 回答业务相关问题

请问有什么可以帮您的？`;
};

/**
 * 职责：解析用户输入内容（辅助录入，支持图片）
 * @param {string} content - 用户粘贴的内容
 * @param {string} type - 解析类型 (purchase/quote/contract)
 * @param {string} imageUrl - 图片URL（可选）
 * @param {string} userId - 用户ID
 * @returns {Object} 解析结果
 */
const parseInput = async (content, type, imageUrl = null, userId = null) => {
  if (!config.kimi.apiKey) {
    return parseLocally(content, type);
  }
  
  const model = imageUrl ? MODELS.vision : MODELS.fast;
  const prompts = {
    purchase: `请解析以下采购信息，提取：商品名称、数量、单价、供应商、规格。以JSON格式返回。
内容：${content}`,
    quote: `请解析以下报价单，提取每个商品的：名称、规格、数量、单价、总价。以JSON数组格式返回。
内容：${content}`,
    contract: `请解析以下合同信息，提取：合同号、供应商/客户名称、商品列表、总金额。以JSON格式返回。
内容：${content}`,
    image: `请识别这张图片的内容，如果是报价单/发票/合同，请提取：商品名称、规格、数量、单价、总价。以JSON格式返回。`,
  };
  
  const userContent = imageUrl
    ? [
        { type: 'text', text: prompts.image },
        { type: 'image_url', image_url: { url: imageUrl } },
      ]
    : prompts[type] || content;
  
  try {
    const result = await callKimiAPI([
      { role: 'system', content: '你是一个数据解析助手，请从用户提供的文本或图片中提取结构化信息，以JSON格式返回。' },
      { role: 'user', content: userContent },
    ], model);
    
    // 记录Token消耗
    if (userId && result.tokenUsage.promptTokens > 0) {
      await recordTokenUsage(userId, null, model, result.tokenUsage, 'parse');
    }
    
    // 尝试提取JSON
    const text = result.content;
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return {
        type,
        confidence: 0.9,
        data: JSON.parse(jsonMatch[0]),
        rawText: content,
        needsConfirmation: true,
        tokenUsage: result.tokenUsage,
      };
    }
    
    return {
      type,
      confidence: 0.5,
      message: text,
      rawText: content,
      needsConfirmation: true,
      tokenUsage: result.tokenUsage,
    };
  } catch (error) {
    console.error('Kimi解析失败:', error.message);
    return parseLocally(content, type);
  }
};

/**
 * 职责：本地解析内容
 */
const parseLocally = (content, type) => {
  const result = {
    type,
    confidence: 0.6,
    data: {},
    rawText: content,
    needsConfirmation: true,
  };
  
  const numbers = content.match(/\d+(\.\d+)?/g) || [];
  const chineseMatch = content.match(/[\u4e00-\u9fa5]+/g) || [];
  
  if (type === 'purchase') {
    result.data = {
      productName: chineseMatch[0] || '',
      quantity: parseFloat(numbers[0]) || 0,
      unitPrice: parseFloat(numbers[1]) || 0,
      supplier: chineseMatch[1] || '',
    };
  } else if (type === 'quote') {
    result.data = {
      items: [{
        name: chineseMatch[0] || '',
        quantity: parseFloat(numbers[0]) || 0,
        price: parseFloat(numbers[1]) || 0,
      }],
    };
  }
  
  return result;
};

/**
 * 职责：获取Token使用统计
 * @param {string} userId - 用户ID
 * @param {number} days - 统计天数
 * @returns {Object} 统计结果
 */
const getTokenStats = async (userId, days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await prisma.tokenUsage.aggregate({
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    _sum: {
      promptTokens: true,
      outputTokens: true,
      totalTokens: true,
    },
    _count: true,
  });
  
  const byModel = await prisma.tokenUsage.groupBy({
    by: ['model'],
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    _sum: { totalTokens: true },
    _count: true,
  });
  
  return {
    period: `${days}天`,
    totalRequests: stats._count,
    totalTokens: stats._sum.totalTokens || 0,
    promptTokens: stats._sum.promptTokens || 0,
    outputTokens: stats._sum.outputTokens || 0,
    byModel: byModel.map(m => ({
      model: m.model,
      requests: m._count,
      tokens: m._sum.totalTokens,
    })),
  };
};

module.exports = {
  chat,
  chatStream,
  parseInput,
  callKimiAPI,
  estimateTokens,
  generateLocalResponse,
  getTokenStats,
  MODELS,
};
