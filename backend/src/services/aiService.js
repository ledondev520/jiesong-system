/**
 * Input: Kimi API、Prisma客户端
 * Output: AI对话和解析结果
 * Pos: AI服务，处理智能问答和辅助录入（含图像理解）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const config = require('../config');
const prisma = require('../utils/prisma');
const { buildChatSession } = require('./ai/chatOrchestrator');
const { collectStreamedChat } = require('./ai/streamHelpers');

const OpenAI = require('openai');

const parsePositiveIntEnv = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
};

const isCiRuntime = process.env.CI === 'true';
const isNodeTestRuntime =
  (Array.isArray(process.execArgv) && process.execArgv.includes('--test')) ||
  process.argv.some((arg) => /\.test\.[cm]?[jt]sx?$/.test(arg));
const isTestRuntime = process.env.NODE_ENV === 'test' || isNodeTestRuntime;
const shouldForceLocalAI =
  process.env.AI_FORCE_LOCAL === 'true' ||
  ((isCiRuntime || isTestRuntime) && process.env.AI_ALLOW_REMOTE !== 'true');

const kimiRequestTimeoutMs = parsePositiveIntEnv(process.env.KIMI_REQUEST_TIMEOUT_MS, 3500, 500, 30000);
const kimiGreetingTimeoutMs = parsePositiveIntEnv(process.env.KIMI_GREETING_TIMEOUT_MS, 1200, 200, 10000);

// Kimi 模型配置
const MODELS = {
  default: 'kimi-k2-turbo-preview', // 默认模型
  vision: 'moonshot-v1-8k-vision-preview', // 视觉模型（8k 版本更稳定）
  fast: 'moonshot-v1-8k', // 快速响应模型
  thinking: 'kimi-k2-thinking-turbo', // 带思考过程的模型
};

const safeToNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractErrorMessage = (error) => {
  if (!error) {
    return '抱歉，AI服务出错了。';
  }

  if (error.status === 401 || error.message?.includes('Unauthorized')) {
    return '错误：API Key无效或已过期，请联系管理员检查配置。';
  }
  if (error.status === 429 || error.message?.includes('rate limit')) {
    return '错误：请求过于频繁，请稍后再试。';
  }
  if (error.status === 400 || error.message?.includes('Invalid')) {
    return `错误：请求参数无效 - ${error.message || '未知错误'}`;
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return '错误：无法连接到AI服务，请检查网络连接。';
  }
  if (error.message) {
    return `错误：${error.message}`;
  }

  return '抱歉，AI服务出错了。';
};

const pickStableOrRandom = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  if (isCiRuntime || isTestRuntime) {
    return items[0];
  }
  return items[Math.floor(Math.random() * items.length)];
};

const createTimeoutSignal = (timeoutMs) => {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }
  return AbortSignal.timeout(timeoutMs);
};

// 初始化OpenAI客户端（用于流式调用）
const getOpenAIClient = () => {
  if (!config.kimi.apiKey || shouldForceLocalAI) return null;
  return new OpenAI({
    apiKey: config.kimi.apiKey,
    baseURL: config.kimi.baseUrl,
    timeout: kimiRequestTimeoutMs,
  });
};

const persistChatMessage = ({ userId, sessionId, role, content, imageUrl = null, promptTokens = 0, outputTokens = 0, modelUsed = null }) => {
  const payload = {
    userId,
    sessionId,
    role,
    content,
  };

  if (imageUrl) {
    payload.imageUrl = imageUrl;
  }

  if (role === 'assistant') {
    payload.promptTokens = safeToNumber(promptTokens);
    payload.outputTokens = safeToNumber(outputTokens);
    if (modelUsed) {
      payload.modelUsed = modelUsed;
    }
  }

  return prisma.chatHistory.create({ data: payload });
};

const persistUserMessage = ({ userId, sessionId, message, imageUrl }) =>
  prisma.chatHistory.create({
    data: {
      userId,
      sessionId,
      role: 'user',
      content: message,
      imageUrl,
    },
  });

const collectStreamText = async (stream) => {
  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) {
      fullContent += delta.content;
    }
  }
  return fullContent;
};

const toSafeCallback = (value) => (typeof value === 'function' ? value : null);

const buildZeroTokenUsage = () => ({
  promptTokens: 0,
  outputTokens: 0,
});

const runThinkingChat = async ({ message, model, messages, onChunk, onThinking }) => {
  const tokenUsage = buildZeroTokenUsage();
  const client = getOpenAIClient();
  if (!client) {
    return {
      response: await generateLocalResponse(message),
      tokenUsage,
    };
  }

  try {
    const tokenEstimate = await estimateTokens(messages, model);
    tokenUsage.promptTokens = safeToNumber(tokenEstimate.data?.total_tokens);

    const streamResult = await collectStreamedChat({
      client,
      model,
      messages,
      onChunk,
      onThinking,
      isThinkingModel: true,
    });

    tokenUsage.outputTokens = Math.ceil((streamResult.fullContent.length + streamResult.thinkingContent.length) / 2);

    return {
      response: streamResult.fullContent,
      tokenUsage,
    };
  } catch (error) {
    console.error('流式调用失败:', error.message, error.stack);
    const fallbackResponse = extractErrorMessage(error);
    if (onChunk) {
      onChunk(fallbackResponse);
    }

    return {
      response: fallbackResponse,
      tokenUsage,
    };
  }
};

const runStandardChat = async ({ messages, model }) => {
  try {
    const result = await callKimiAPI(messages, model);
    return {
      response: result.content,
      tokenUsage: {
        promptTokens: safeToNumber(result.tokenUsage.promptTokens),
        outputTokens: safeToNumber(result.tokenUsage.outputTokens),
      },
    };
  } catch (error) {
    const fallback = extractErrorMessage(error);
    return {
      response: fallback,
      tokenUsage: buildZeroTokenUsage(),
    };
  }
};

const runChatModel = async ({ message, model, useThinking, messages, onChunk, onThinking }) => {
  if (!config.kimi.apiKey) {
    return {
      response: await generateLocalResponse(message),
      tokenUsage: buildZeroTokenUsage(),
    };
  }

  if (useThinking) {
    return runThinkingChat({
      message,
      model,
      messages,
      onChunk,
      onThinking,
    });
  }

  return runStandardChat({ messages, model });
};

const buildTokenRecordArgs = (userId, sessionId, model, tokenUsage, useThinking) => {
  if (tokenUsage.promptTokens <= 0) {
    return null;
  }

  return {
    userId,
    sessionId,
    model,
    tokenUsage,
    requestType: useThinking ? 'chat_stream' : 'chat',
  };
};

const buildChatApiResult = ({ response, model, tokenUsage, sessionId }) => ({
  message: response,
  sessionId,
  tokenUsage: {
    prompt: tokenUsage.promptTokens,
    completion: tokenUsage.outputTokens,
    total: tokenUsage.promptTokens + tokenUsage.outputTokens,
  },
  model,
});

const resolveChatResult = async ({ userId, sessionId, message, imageUrl, useThinking, onChunk, onThinking }) => {
  const result = await runChatSession({
    userId,
    sessionId,
    message,
    imageUrl,
    useThinking,
    onChunk,
    onThinking,
  });

  return buildChatApiResult({
    response: result.response,
    model: result.model,
    tokenUsage: result.tokenUsage,
    sessionId,
  });
};

/**
 * 职责：从 systemConfig 读取 AI 模型优先级配置，带 30 秒内存缓存
 */
let _modelConfigCache = null;
let _modelConfigCacheAt = 0;
const getConfiguredModels = async () => {
  const now = Date.now();
  if (_modelConfigCache && now - _modelConfigCacheAt < 30_000) return _modelConfigCache;

  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ['aiPrimaryModel', 'aiFallbackModel'] } },
    select: { key: true, value: true },
  });

  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  _modelConfigCache = {
    defaultModel: map.aiPrimaryModel || MODELS.default,
    thinkingModel: map.aiFallbackModel || MODELS.thinking,
  };
  _modelConfigCacheAt = now;
  return _modelConfigCache;
};

const runChatSession = async ({
  userId,
  sessionId,
  message,
  imageUrl,
  useThinking,
  onChunk,
  onThinking,
}) => {
  // 0. 读取管理员配置的模型优先级（primary/fallback）
  const { defaultModel, thinkingModel } = await getConfiguredModels();

  const { messages, model } = await buildChatSession({
    userId,
    sessionId,
    message,
    imageUrl,
    defaultModel,
    visionModel: MODELS.vision,
    thinkingModel,
    useThinkingModel: Boolean(useThinking),
  });

  await persistUserMessage({ userId, sessionId, message, imageUrl });

  const { response: aiResponse, tokenUsage } = await runChatModel({
    message,
    model,
    useThinking,
    messages,
    onChunk,
    onThinking,
  });

  const tokenRecord = buildTokenRecordArgs(userId, sessionId, model, tokenUsage, useThinking);
  if (tokenRecord) {
    await recordTokenUsage(tokenRecord.userId, tokenRecord.sessionId, tokenRecord.model, tokenRecord.tokenUsage, tokenRecord.requestType);
  }

  await persistChatMessage({
    userId,
    sessionId,
    role: 'assistant',
    content: aiResponse,
    promptTokens: tokenUsage.promptTokens,
    outputTokens: tokenUsage.outputTokens,
    modelUsed: model,
  });

  return {
    response: aiResponse,
    model,
    tokenUsage,
  };
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
  const result = await resolveChatResult({
    userId,
    sessionId,
    message,
    imageUrl,
    useThinking: false,
  });

  console.log(`[AI] 使用模型: ${result.model}, 当前图片: ${!!imageUrl}`);

  return result;
};

/**
 * 职责：流式调用Kimi API进行对话（支持 thinking 模型）
 * 思路：
 * 1. 构建消息列表
 * 2. 使用 kimi-k2-thinking 模型进行流式调用
 * 3. 分别处理 reasoning_content（思考过程）和 content（最终内容）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {string} message - 用户消息
 * @param {string} imageUrl - 图片URL（可选）
 * @param {function} onChunk - 最终内容的回调函数
 * @param {function} onThinking - 思考过程的回调函数（可选）
 * @returns {Object} 最终结果
 */
const chatStream = async (userId, sessionId, message, imageUrl = null, onChunk, onThinking = null) => {
  return resolveChatResult({
    userId,
    sessionId,
    message,
    imageUrl,
    useThinking: true,
    onChunk,
    onThinking,
  });
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
    
    const fullContent = await collectStreamText(stream);
    
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
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.kimi.apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    };

    const timeoutSignal = createTimeoutSignal(kimiRequestTimeoutMs);
    if (timeoutSignal) {
      requestOptions.signal = timeoutSignal;
    }

    const response = await fetch(`${config.kimi.baseUrl}/tokenizers/estimate-token-count`, requestOptions);
    
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
        include: { salesContract: true },
      });
      if (inventory?.salesContract) {
        return `${products[0].customsName}目前在货柜${inventory.salesContract.contractNo}中，状态为${inventory.status}。`;
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

const buildParsedInputResult = (text, type, rawText, tokenUsage) => {
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) {
    return {
      type,
      confidence: 0.5,
      message: text,
      rawText,
      needsConfirmation: true,
      tokenUsage,
    };
  }

  try {
    return {
      type,
      confidence: 0.9,
      data: JSON.parse(jsonMatch[0]),
      rawText,
      needsConfirmation: true,
      tokenUsage,
    };
  } catch {
    return {
      type,
      confidence: 0.5,
      message: text,
      rawText,
      needsConfirmation: true,
      tokenUsage,
    };
  }
};

const parseInputPromptMap = {
  purchase: (content) => `请解析以下采购信息，提取：商品名称、数量、单价、供应商、规格。以JSON格式返回。
内容：${content}`,
  quote: (content) => `请解析以下报价单，提取每个商品的：名称、规格、数量、单价、总价。以JSON数组格式返回。
内容：${content}`,
  contract: (content) => `请解析以下合同信息，提取：合同号、供应商/客户名称、商品列表、总金额。以JSON格式返回。
内容：${content}`,
};

const buildImagePrompt = () => `请识别这张图片的内容，如果是报价单/发票/合同，请提取：商品名称、规格、数量、单价、总价。以JSON格式返回。`;

const buildInputContent = (content, type, imageUrl) => {
  if (!imageUrl) {
    return parseInputPromptMap[type]?.(content) || content;
  }

  return [
    { type: 'text', text: buildImagePrompt() },
    { type: 'image_url', image_url: { url: imageUrl } },
  ];
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
  const userContent = buildInputContent(content, type, imageUrl);
  
  try {
    const result = await callKimiAPI([
      { role: 'system', content: '你是一个数据解析助手，请从用户提供的文本或图片中提取结构化信息，以JSON格式返回。' },
      { role: 'user', content: userContent },
    ], model);
    
    // 记录Token消耗
    if (userId && result.tokenUsage.promptTokens > 0) {
      await recordTokenUsage(userId, null, model, result.tokenUsage, 'parse');
    }
    
    return buildParsedInputResult(result.content, type, content, result.tokenUsage);
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

  // 1. 汇总统计
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

  // 2. 按模型分组
  const byModel = await prisma.tokenUsage.groupBy({
    by: ['model'],
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    _sum: { totalTokens: true },
    _count: true,
  });

  // 3. 获取每日明细（SQLite 用 date() 函数截取日期）
  const dailyRaw = await prisma.$queryRaw`
    SELECT
      date(createdAt) AS day,
      model,
      SUM(totalTokens) AS tokens,
      COUNT(*) AS requests,
      SUM(CASE WHEN totalTokens > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS successRate
    FROM token_usages
    WHERE userId = ${userId}
      AND createdAt >= ${startDate.toISOString()}
    GROUP BY day, model
    ORDER BY day ASC
  `;

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
    // 每日折线图数据：[{ day, model, tokens, requests, successRate }]
    daily: (dailyRaw || []).map(r => ({
      day: r.day,
      model: r.model,
      tokens: Number(r.tokens) || 0,
      requests: Number(r.requests) || 0,
      successRate: Math.round(Number(r.successRate) || 100),
    })),
  };
};

// 五月天50首经典歌曲名称列表
const MAYDAY_SONGS = [
  '倔强', '温柔', '知足', '突然好想你', '我不愿让你一个人',
  '干杯', '恋爱ing', '天使', '志明与春娇', '疯狂世界',
  '后来的我们', '盛夏光年', '憨人', '人生海海', '爱情万岁',
  '入阵曲', '仓颉', '拥抱', '纯真', '生命有一种绝对',
  '听不到', '咸鱼', '如烟', '洋葱', '星空',
  '离开地球表面', '孙悟空', '最重要的小事', '伤心的人别听慢歌', '顽固',
  '好好', '如果我们不曾相遇', '一颗苹果', '终结孤单', '圣诞结',
  '而我知道', '倾听', '春天的呐喊', '雌雄同体', 'DNA',
  '派对动物', '为爱而生', '你不是真正的快乐', '笑忘歌', '第二人生',
  '将军令', '出头天', '我心中尚未崩坏的地方', '候鸟', '成名在望'
];

/**
 * 职责：生成带五月天歌曲主题的AI问候语
 * 思路：
 * 1. 使用 kimi-k2-turbo-preview 模型（快速响应）
 * 2. 从50首著名歌曲中随机选择一首
 * 3. 让模型生成问候语
 */
const generateGreeting = async () => {
  const client = getOpenAIClient();
  if (!client) {
    return getLocalGreeting();
  }

  const selectedSong = pickStableOrRandom(MAYDAY_SONGS) || MAYDAY_SONGS[0];

  const systemPrompt = `你是精通歌词的大师。请根据五月天歌曲《${selectedSong}》的歌词，生成一段温暖的问候语。

要求：
1. 生成一句简短的问候语（10字） 
2. 获取这首歌连贯的4句歌词

直接输出5行文字，不要其他内容。`;

  try {
    const requestOptions = {
      model: 'kimi-k2-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '生成问候语' },
      ],
      temperature: 0.8,
      stream: true,
    };

    const timeoutSignal = createTimeoutSignal(kimiGreetingTimeoutMs);
    if (timeoutSignal) {
      requestOptions.signal = timeoutSignal;
    }

    const stream = await client.chat.completions.create(requestOptions);

    const fullContent = await collectStreamText(stream);

    const lines = fullContent.trim().split('\n').filter(line => line.trim());
    
    if (lines.length >= 2) {
      console.log(`[AI Greeting] 成功生成问候语，歌曲：${selectedSong}`);
      return {
        greeting: lines[0].trim(),
        songName: selectedSong,
        lyrics: lines.slice(1, 5).map(line => line.trim()),
        source: 'ai',
      };
    }
    
    return getLocalGreeting();
  } catch (error) {
    console.error('生成问候语失败:', error.message);
    return getLocalGreeting();
  }
};

const generateGreetingStream = async (onThinking, onContent, onDone) => {
  const resolvedOnThinking = toSafeCallback(onThinking);
  const resolvedOnContent = toSafeCallback(onContent);
  const resolvedOnDone = toSafeCallback(onDone);

  if (resolvedOnThinking) {
    resolvedOnThinking('生成问候语中...');
  }

  const result = await generateGreeting();

  if (resolvedOnContent) {
    if (result.greeting) {
      resolvedOnContent(result.greeting);
    }
    if (Array.isArray(result.lyrics)) {
      result.lyrics.forEach((line) => resolvedOnContent(line));
    }
  }

  if (resolvedOnDone) {
    resolvedOnDone(result);
  }

  return result;
};

/**
 * 职责：获取本地预设问候语（备用方案，不含歌词）
 * 说明：当 AI 服务不可用时的降级方案
 */
const getLocalGreeting = () => {
  const greetings = [
    {
      greeting: '每一天都是新的开始！',
      songName: '',
      lyrics: ['欢迎使用捷淞进销存系统', 'AI助手随时为您服务', '祝您工作顺利', '今天也要加油哦'],
    },
    {
      greeting: '用热情开启元气满满的一天！',
      songName: '',
      lyrics: ['新的一天新的希望', '让我们一起努力', '相信自己的力量', '美好的事情即将发生'],
    },
    {
      greeting: '愿今天的你充满力量！',
      songName: '',
      lyrics: ['保持微笑面对挑战', '每一步都是成长', '坚持就是胜利', '你是最棒的'],
    },
  ];

  const randomGreeting = pickStableOrRandom(greetings) || greetings[0];
  return { ...randomGreeting, source: 'local' };
};

/**
 * 职责：简单非流式 AI 调用（供内部其他模块使用）
 * @param {Array} messages - OpenAI 格式的消息列表
 * @param {string} [model] - 使用的模型（默认 MODELS.fast）
 * @returns {{ content: string, tokenUsage: object }}
 */
const callAI = async (messages, model = MODELS.fast) => {
  return callKimiAPI(messages, model);
};

module.exports = {
  chat,
  chatStream,
  parseInput,
  callKimiAPI,
  callAI,
  estimateTokens,
  generateLocalResponse,
  getTokenStats,
  generateGreetingStream,
  generateGreeting,
  MODELS,
};
