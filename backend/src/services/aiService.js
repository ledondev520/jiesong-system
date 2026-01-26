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

// Kimi 模型配置
const MODELS = {
  default: 'kimi-k2-turbo-preview', // 默认模型
  vision: 'moonshot-v1-8k-vision-preview', // 视觉模型（8k 版本更稳定）
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
  
  // 0.5 查询数据库获取相关上下文
  const dbContext = await getDbContext(message);
  
  // 1. 构建消息列表（系统提示词 + 数据库上下文）
  const messages = [
    { role: 'system', content: getSystemPrompt() + dbContext },
    ...history.map(h => buildMessageFromHistory(h)),
  ];
  
  // 2. 构建当前用户消息
  const userMessage = buildUserMessage(message, imageUrl);
  messages.push(userMessage);
  
  // 3. 选择模型（当前消息或历史消息有图片时，使用视觉模型）
  const hasImageInHistory = history.some(h => h.imageUrl);
  const needsVisionModel = imageUrl || hasImageInHistory;
  const model = needsVisionModel ? MODELS.vision : MODELS.default;
  
  console.log(`[AI] 使用模型: ${model}, 当前图片: ${!!imageUrl}, 历史图片: ${hasImageInHistory}`);
  
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
  const client = getOpenAIClient();
  
  // 0. 获取历史对话（最近10条）
  const history = await prisma.chatHistory.findMany({
    where: { userId, sessionId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  
  // 0.5 查询数据库获取相关上下文
  const dbContext = await getDbContext(message);
  
  // 1. 构建消息列表（系统提示词 + 数据库上下文）
  const messages = [
    { role: 'system', content: getSystemPrompt() + dbContext },
    ...history.map(h => buildMessageFromHistory(h)),
  ];
  
  // 2. 构建当前用户消息
  const userMessage = buildUserMessage(message, imageUrl);
  messages.push(userMessage);
  
  // 3. 选择模型（有图片时用视觉模型，否则用 thinking-turbo 模型）
  const hasImageInHistory = history.some(h => h.imageUrl);
  const needsVisionModel = imageUrl || hasImageInHistory;
  // 使用 thinking-turbo 模型（更快的推理速度，除非需要视觉能力）
  const model = needsVisionModel ? MODELS.vision : 'kimi-k2-thinking-turbo';
  
  console.log(`[AI] 使用模型: ${model}, 当前图片: ${!!imageUrl}, 历史图片: ${hasImageInHistory}`);
  
  // 4. 保存用户消息
  await prisma.chatHistory.create({
    data: { userId, sessionId, role: 'user', content: message, imageUrl },
  });
  
  // 5. 流式调用Kimi API
  let fullContent = '';
  let thinkingContent = '';
  let tokenUsage = { promptTokens: 0, outputTokens: 0 };
  
  if (client) {
    try {
      // 估算输入Token
      const tokenEstimate = await estimateTokens(messages, model);
      tokenUsage.promptTokens = tokenEstimate.data?.total_tokens || 0;
      
      // 流式调用（thinking 模型需要 temperature=1.0 和更大的 max_tokens）
      const isThinkingModel = model.includes('thinking');
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: isThinkingModel ? 1.0 : 0.6,
        max_tokens: isThinkingModel ? 16000 : undefined,
        stream: true,
      });
      
      // 逐个chunk处理
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        // 处理 reasoning_content（思考过程）
        if (delta && Object.prototype.hasOwnProperty.call(delta, 'reasoning_content')) {
          const reasoning = delta.reasoning_content;
          if (reasoning) {
            thinkingContent += reasoning;
            if (onThinking) {
              onThinking(reasoning);
            }
          }
        }
        
        // 处理 content（最终内容）
        if (delta?.content) {
          fullContent += delta.content;
          if (onChunk) {
            onChunk(delta.content);
          }
        }
      }
      
      // 估算输出Token
      tokenUsage.outputTokens = Math.ceil((fullContent.length + thinkingContent.length) / 2);
      
    } catch (error) {
      console.error('流式调用失败:', error.message, error.stack);
      let errorMessage = '抱歉，AI服务出错了。';
      if (error.status === 401 || error.message?.includes('Unauthorized')) {
        errorMessage = '错误：API Key无效或已过期，请联系管理员检查配置。';
      } else if (error.status === 429 || error.message?.includes('rate limit')) {
        errorMessage = '错误：请求过于频繁，请稍后再试。';
      } else if (error.status === 400 || error.message?.includes('Invalid')) {
        errorMessage = '错误：请求参数无效 - ' + (error.message || '未知错误');
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = '错误：无法连接到AI服务，请检查网络连接。';
      } else if (error.message) {
        errorMessage = '错误：' + error.message;
      }
      fullContent = errorMessage;
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
    thinking: thinkingContent,
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

编号格式：
- 货柜：年份-序号-港口简码，如 25-001-LA
- 采购合同：CG + 年份 + 5位序号，如 CG2500001
- 出口合同：EXP + 年份 + 5位序号，如 EXP2500001

重要：当用户查询合同或货柜信息时：
1. 直接引用【数据库参考信息】中的实际数据来回答
2. 如果找到相关数据，详细列出商品明细、数量、金额等
3. 提供跳转链接让用户可以查看更多详情，格式示例：
   - "点击查看销售合同详情: /dashboard/contracts?tab=sales"
   - "点击查看货柜详情: /dashboard/inventory-container?tab=container"
4. 如果用户输入的编号可能有误（如多了一个数字），主动查找相似的记录并提示
5. 如果数据库中没有相关数据，明确告知用户"系统中未找到此记录"

请用中文回答，语言简洁专业。当用户上传图片时，请仔细识别图片内容并提取有用信息。`;
};

/**
 * 职责：查询数据库获取与用户问题相关的上下文
 * 思路：
 * 1. 分析用户问题中的关键词
 * 2. 查询相关的商品、供应商、合同、货柜等数据
 * 3. 格式化为上下文字符串返回给AI
 * @param {string} message - 用户消息
 * @returns {string} 数据库上下文
 */
const getDbContext = async (message) => {
  const context = [];
  const lowerMsg = message.toLowerCase();
  
  try {
    // 1. 统计数据（总是包含）
    const [productCount, supplierCount, purchaseCount, salesCount, containerCount] = await Promise.all([
      prisma.product.count(),
      prisma.supplier.count(),
      prisma.purchaseContract.count(),
      prisma.salesContract.count(),
      prisma.container.count(),
    ]);
    
    context.push(`【系统统计】商品${productCount}种, 供应商${supplierCount}家, 采购合同${purchaseCount}份, 销售合同${salesCount}份, 货柜${containerCount}个`);
    
    // 2. 查询相关商品
    if (lowerMsg.includes('商品') || lowerMsg.includes('产品') || lowerMsg.includes('货')) {
      const keywords = extractKeywords(message);
      for (const keyword of keywords) {
        const products = await prisma.product.findMany({
          where: { customsName: { contains: keyword } },
          take: 5,
        });
        if (products.length > 0) {
          context.push(`【商品"${keyword}"】找到${products.length}条: ` + products.map(p => `${p.customsName}(${p.unit})`).join(', '));
        }
      }
    }
    
    // 3. 查询供应商
    if (lowerMsg.includes('供应商') || lowerMsg.includes('厂家') || lowerMsg.includes('谁')) {
      const keywords = extractKeywords(message);
      for (const keyword of keywords) {
        const suppliers = await prisma.supplier.findMany({
          where: { OR: [{ name: { contains: keyword } }, { shortName: { contains: keyword } }] },
          take: 5,
        });
        if (suppliers.length > 0) {
          context.push(`【供应商"${keyword}"】找到${suppliers.length}家: ` + suppliers.map(s => `${s.name}(${s.shortName || '无简称'})`).join(', '));
        }
      }
    }
    
    // 4. 查询合同
    if (lowerMsg.includes('合同') || lowerMsg.includes('cg') || lowerMsg.includes('exp') || lowerMsg.includes('采购') || lowerMsg.includes('销售')) {
      // 查询采购合同
      const purchaseKeyword = message.match(/CG\d+/i)?.[0];
      if (purchaseKeyword) {
        const purchases = await prisma.purchaseContract.findMany({
          where: { contractNo: { contains: purchaseKeyword.toUpperCase() } },
          include: { supplier: true },
          take: 3,
        });
        if (purchases.length > 0) {
          context.push(`【采购合同"${purchaseKeyword}"】` + purchases.map(p => `${p.contractNo}(供应商:${p.supplier?.name || '未知'}, 金额:¥${p.totalAmount})`).join('; '));
        }
      }
      
      // 查询销售合同（包含商品明细）
      const salesKeyword = message.match(/EXP\d+/i)?.[0];
      if (salesKeyword) {
        const sales = await prisma.salesContract.findMany({
          where: { contractNo: { contains: salesKeyword.toUpperCase() } },
          include: { 
            items: { 
              include: { 
                product: true, 
                store: true 
              } 
            } 
          },
          take: 3,
        });
        if (sales.length > 0) {
          for (const s of sales) {
            const itemDetails = s.items?.map(item => 
              `${item.product?.customsName || '未知商品'}(${item.quantity}${item.product?.unit || ''}, 售价$${item.sellingPrice}, 门店:${item.store?.name || '未知'})`
            ).join(', ') || '无商品明细';
            
            context.push(`【销售合同${s.contractNo}】状态:${s.status}, 金额:$${s.totalAmount}, 已收:$${s.receivedAmount}\n  商品明细: ${itemDetails}\n  链接: /dashboard/contracts?tab=sales`);
          }
        } else {
          // 模糊匹配（用户可能输入错误的编号）
          const fuzzySearch = salesKeyword.toUpperCase().replace(/EXP/, '');
          const fuzzySales = await prisma.salesContract.findMany({
            where: { contractNo: { contains: fuzzySearch } },
            include: { 
              items: { 
                include: { 
                  product: true, 
                  store: true 
                } 
              } 
            },
            take: 3,
          });
          if (fuzzySales.length > 0) {
            context.push(`【提示】未找到精确匹配的"${salesKeyword}"，但找到以下相似合同:`);
            for (const s of fuzzySales) {
              const itemDetails = s.items?.map(item => 
                `${item.product?.customsName || '未知商品'}(${item.quantity}${item.product?.unit || ''})`
              ).join(', ') || '无商品明细';
              context.push(`  - ${s.contractNo}: $${s.totalAmount}, 商品: ${itemDetails}`);
            }
          }
        }
      }
      
      // 最近合同汇总
      if (!purchaseKeyword && !salesKeyword && (lowerMsg.includes('采购') || lowerMsg.includes('合同'))) {
        const recentPurchases = await prisma.purchaseContract.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { supplier: true },
        });
        if (recentPurchases.length > 0) {
          context.push(`【最近采购合同】` + recentPurchases.map(p => `${p.contractNo}(${p.supplier?.shortName || p.supplier?.name || '未知'}, ¥${p.totalAmount})`).join(', '));
        }
      }
    }
    
    // 5. 查询货柜（包含商品明细）
    if (lowerMsg.includes('货柜') || lowerMsg.includes('集装箱') || lowerMsg.includes('柜') || lowerMsg.match(/\d{2}-\d{3}/)) {
      const containerNo = message.match(/\d{2}-\d{3}(-\w+)?/)?.[0];
      if (containerNo) {
        const containers = await prisma.container.findMany({
          where: { containerNo: { contains: containerNo } },
          include: { 
            port: true,
            items: {
              include: {
                product: true
              }
            }
          },
          take: 3,
        });
        if (containers.length > 0) {
          for (const c of containers) {
            const itemDetails = c.items?.map(item => 
              `${item.product?.customsName || '未知商品'}(${item.quantity}${item.product?.unit || ''}, ${item.boxes || 0}箱)`
            ).join(', ') || '暂无装箱记录';
            
            context.push(`【货柜${c.containerNo}】港口:${c.port?.name || '未知'}, 状态:${c.status}, 总箱数:${c.totalBoxes}, 体积:${c.volume}CBM\n  装箱明细: ${itemDetails}\n  链接: /dashboard/inventory-container?tab=container`);
          }
        }
      } else {
        // 最近货柜
        const recentContainers = await prisma.container.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { 
            port: true,
            items: { include: { product: true } }
          },
        });
        if (recentContainers.length > 0) {
          context.push(`【最近货柜】`);
          for (const c of recentContainers) {
            const itemCount = c.items?.length || 0;
            context.push(`  - ${c.containerNo}: ${c.port?.name || '未知'}, ${c.status}, ${itemCount}种商品, ${c.totalBoxes}箱`);
          }
        }
      }
    }
    
    // 6. 库存和位置查询
    if (lowerMsg.includes('位置') || lowerMsg.includes('在哪') || lowerMsg.includes('库存') || lowerMsg.includes('多少')) {
      const keywords = extractKeywords(message);
      for (const keyword of keywords) {
        const inventories = await prisma.inventory.findMany({
          where: { product: { customsName: { contains: keyword } } },
          include: { product: true, container: { include: { port: true } } },
          take: 5,
        });
        if (inventories.length > 0) {
          context.push(`【库存"${keyword}"】` + inventories.map(i => 
            `${i.product.customsName}: ${i.quantity}${i.product.unit}, 货柜${i.container?.containerNo || '未装柜'}, 状态${i.status}`
          ).join('; '));
        }
      }
    }
    
    // 7. 价格查询
    if (lowerMsg.includes('价格') || lowerMsg.includes('售价') || lowerMsg.includes('成本')) {
      const exchangeConfig = await prisma.systemConfig.findUnique({ where: { key: 'exchangeRate' } });
      if (exchangeConfig) {
        try {
          const rate = JSON.parse(exchangeConfig.value);
          context.push(`【汇率配置】当前汇率${rate.rate || rate}, 缓冲值${rate.buffer || 0.2}`);
        } catch {
          context.push(`【汇率配置】当前汇率${exchangeConfig.value}`);
        }
      }
    }
    
    // 8. 财务查询
    if (lowerMsg.includes('付款') || lowerMsg.includes('欠款') || lowerMsg.includes('应付') || lowerMsg.includes('应收') || lowerMsg.includes('财务')) {
      const [payableStats, receivableStats] = await Promise.all([
        prisma.purchaseContract.aggregate({
          where: { NOT: { status: 'CANCELLED' } },
          _sum: { totalAmount: true, paidAmount: true },
        }),
        prisma.salesContract.aggregate({
          where: { NOT: { status: 'CANCELLED' } },
          _sum: { totalAmount: true, receivedAmount: true },
        }),
      ]);
      
      const payableTotal = payableStats._sum.totalAmount || 0;
      const paidTotal = payableStats._sum.paidAmount || 0;
      const receivableTotal = receivableStats._sum.totalAmount || 0;
      const receivedTotal = receivableStats._sum.receivedAmount || 0;
      
      context.push(`【财务概况】应付总额¥${payableTotal}, 已付¥${paidTotal}, 待付¥${payableTotal - paidTotal}; 应收总额$${receivableTotal}, 已收$${receivedTotal}, 待收$${receivableTotal - receivedTotal}`);
    }
    
  } catch (error) {
    console.error('查询数据库上下文失败:', error.message);
  }
  
  return context.length > 0 ? '\n\n【数据库参考信息】\n' + context.join('\n') : '';
};

/**
 * 职责：从用户消息中提取关键词
 * @param {string} message - 用户消息
 * @returns {string[]} 关键词列表
 */
const extractKeywords = (message) => {
  // 移除常见的问句词
  const stopWords = ['是什么', '在哪', '多少', '有没有', '能不能', '怎么', '哪里', '哪个', '什么', '请', '帮我', '查询', '查一下', '找', '看看'];
  let text = message;
  stopWords.forEach(w => { text = text.replace(new RegExp(w, 'g'), ' '); });
  
  // 提取中文词（2-10个字）
  const chineseWords = text.match(/[\u4e00-\u9fa5]{2,10}/g) || [];
  
  // 提取合同编号
  const contractNos = text.match(/[A-Za-z]{2,3}\d+/g) || [];
  
  // 提取货柜编号
  const containerNos = text.match(/\d{2}-\d{3}(-\w+)?/g) || [];
  
  return [...new Set([...chineseWords, ...contractNos, ...containerNos])].slice(0, 5);
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

  // 随机选择一首歌
  const randomSong = MAYDAY_SONGS[Math.floor(Math.random() * MAYDAY_SONGS.length)];

  const systemPrompt = `你是精通歌词的大师。请根据五月天歌曲《${randomSong}》的歌词，生成一段温暖的问候语。

要求：
1. 生成一句简短的问候语（10字） 
2. 获取这首歌连贯的4句歌词

直接输出5行文字，不要其他内容。`;

  try {
    const stream = await client.chat.completions.create({
      model: 'kimi-k2-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '生成问候语' },
      ],
      temperature: 0.8,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
      }
    }

    const lines = fullContent.trim().split('\n').filter(line => line.trim());
    
    if (lines.length >= 2) {
      console.log(`[AI Greeting] 成功生成问候语，歌曲：${randomSong}`);
      return {
        greeting: lines[0].trim(),
        songName: randomSong,
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

  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
  return { ...randomGreeting, source: 'local' };
};

module.exports = {
  chat,
  chatStream,
  parseInput,
  callKimiAPI,
  estimateTokens,
  generateLocalResponse,
  getTokenStats,
  generateGreeting,
  MODELS,
};
