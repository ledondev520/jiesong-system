/**
 * Input: 当前 AI provider（OpenAI / DeepSeek / Kimi）、Prisma客户端
 * Output: AI对话和解析结果
 * Pos: AI服务，处理智能问答和辅助录入（含图像理解）；统一 provider/profile、完整 deadline 与流式 usage
 */

const config = require('../config');
const prisma = require('../utils/prisma');
const { currentRates, priceFor } = require('./exportPricing');
const { buildChatSession } = require('./ai/chatOrchestrator');
const { collectStreamedChat } = require('./ai/streamHelpers');
const { wrapWithFallback, createBreaker } = require('./ai/fallbackClient');

const OpenAI = require('openai');
const { wrapOpenAIClient } = require('./ai/openaiProvider');
const { decryptApiKeyFromStorage } = require('../utils/secretCrypto');
const getActiveAIConfig = () => config.ai || config.kimi;
const isDeepSeek = () => getActiveAIConfig().provider === 'deepseek';
const isOpenAI = () => getActiveAIConfig().provider === 'openai';
// DeepSeek/OpenAI 没有 Kimi 的 tokenizer 与问候接口：用上游 usage，缺失时不估算，问候走本地。
const usesUpstreamUsage = () => isDeepSeek() || isOpenAI();

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

const kimiRequestTimeoutMs = parsePositiveIntEnv(process.env.KIMI_REQUEST_TIMEOUT_MS, 30000, 500, 30000);

// DeepSeek 统一四个场景；Kimi 保留既有模型配置。
const MODELS = isOpenAI() ? {
  // OPENAI_MODEL（默认 gpt-6.1-terra）同时服务聊天、视觉、快速与"思考"场景；无回退模型。
  default: getActiveAIConfig().model,
  vision: getActiveAIConfig().model,
  fast: getActiveAIConfig().model,
  thinking: getActiveAIConfig().model,
} : isDeepSeek() ? {
  default: 'deepseek-flash',
  vision: 'deepseek-flash',
  fast: 'deepseek-flash',
  thinking: 'deepseek-flash',
} : {
  default: 'kimi-k2-turbo-preview', // 默认模型
  vision: 'moonshot-v1-8k-vision-preview', // 视觉模型（8k 版本更稳定）
  fast: 'moonshot-v1-8k', // 快速响应模型
  thinking: 'kimi-k2-thinking-turbo', // 带思考过程的模型
};

const getAIModelOptions = () => {
  if (isOpenAI()) return { model: getActiveAIConfig().model };
  return isDeepSeek()
    ? { model: 'deepseek-flash', thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    : {};
};

const safeToNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** 职责：解析 systemConfig.value（JSON 字符串或原始值）为 JS 值 */
const parseStoredConfigValue = (raw) => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const clampNumber = (n, min, max) => Math.min(max, Math.max(min, n));

/** 职责：从配置读取 AI 温度，默认 0.6，限制在 0–1 */
const parseAiTemperature = (raw) => {
  const v = parseStoredConfigValue(raw);
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0.6;
  return clampNumber(n, 0, 1);
};

/** 职责：从配置读取 max_tokens，默认 4096，按 256 对齐并限制 256–8192 */
const parseAiMaxTokens = (raw) => {
  const v = parseStoredConfigValue(raw);
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return 4096;
  const stepped = Math.round(n / 256) * 256;
  return clampNumber(stepped, 256, 8192);
};

const extractErrorMessage = (error) => {
  if (!error) {
    return '抱歉，AI服务出错了。';
  }

  if (error.status === 401 || error.message?.includes('Unauthorized')) {
    return '错误：API Key无效或已过期，请联系管理员检查配置。';
  }
  // OpenAI 额度（负责人在控制台设置的花费上限）用尽：不是限流，重试也无用。
  if (error.code === 'insufficient_quota' || error.error?.code === 'insufficient_quota') {
    return '错误：AI 用量额度已用完，请联系管理员处理。';
  }
  if (error.status === 429 || error.message?.includes('rate limit')) {
    return '错误：请求过于频繁，请稍后再试。';
  }
  if (error.status === 404) {
    return '错误：当前AI模型不可用，请联系管理员检查模型配置。';
  }
  if (error.status === 400 || error.message?.includes('Invalid')) {
    return '错误：AI请求参数无效，请联系管理员检查模型参数。';
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return '错误：无法连接到AI服务，请检查网络连接。';
  }
  if (/Timeout|Abort/.test(error.name || '')) {
    return '错误：AI服务响应超时，请稍后重试。';
  }

  return '抱歉，AI服务出错了。';
};

const createTimeoutSignal = (timeoutMs) => {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }
  return AbortSignal.timeout(timeoutMs);
};

// SDK timeout 仅覆盖响应头，signal 同时限制连接与完整响应体；失败不自动重试。
const getAIRequestOptions = (timeoutMs = kimiRequestTimeoutMs) => ({
  timeout: timeoutMs,
  maxRetries: 0,
  signal: createTimeoutSignal(timeoutMs),
});

const resolveDeepSeekKey = async (envKey) => {
  const stored = await prisma.systemConfig.findUnique({ where: { key: 'deepseekApiKey' }, select: { value: true } });
  return (stored?.value && decryptApiKeyFromStorage(stored.value)) || envKey;
};

const buildSdkClient = (apiKey, baseUrl) => new OpenAI({
  apiKey,
  baseURL: baseUrl,
  timeout: kimiRequestTimeoutMs,
  maxRetries: 0,
  logLevel: 'off',
});

// AI_FALLBACK_PROVIDER 启用且主供应商不是 DeepSeek 时才回退；熔断状态按进程保存，阈值/冷却变化时重建。
const isFallbackEnabled = () => Boolean(config.aiFallback?.enabled) && !isDeepSeek();
let fallbackBreaker = null;
let fallbackBreakerKey = '';
const getFallbackBreaker = () => {
  const { breakerThreshold: threshold, breakerCooldownMs: cooldownMs } = config.aiFallback;
  const key = `${threshold}:${cooldownMs}`;
  if (!fallbackBreaker || fallbackBreakerKey !== key) {
    fallbackBreaker = createBreaker({ threshold, cooldownMs });
    fallbackBreakerKey = key;
  }
  return fallbackBreaker;
};

let fallbackKeyWarned = false;
const getFallbackClient = async () => {
  const fallback = config.aiFallback;
  const apiKey = await resolveDeepSeekKey(fallback.apiKey);
  if (!apiKey) {
    if (!fallbackKeyWarned) { fallbackKeyWarned = true; console.warn('[ai-fallback] 未找到 DeepSeek 密钥，回退不可用'); }
    return null;
  }
  return buildSdkClient(apiKey, fallback.baseUrl);
};

// 初始化OpenAI客户端（用于流式调用）；所有调用方（聊天、解析、HS、Agent）都经此处，回退只在这一处接入。
const getOpenAIClient = async ({ fallback = true } = {}) => {
  if (shouldForceLocalAI) return null;
  const active = getActiveAIConfig();
  const apiKey = isDeepSeek() ? await resolveDeepSeekKey(active.apiKey) : active.apiKey;
  if (!apiKey) return null;
  const client = buildSdkClient(apiKey, active.baseUrl);
  // SDK 自身重试保持关闭；OpenAI 仅在共用 deadline 内对创建请求做 429/5xx 有限重试（流开始后不重放）。
  const primary = isOpenAI()
    ? wrapOpenAIClient(client, { maxRetries: active.maxRetries, maxOutputTokens: active.maxOutputTokens })
    : client;
  // 问候等极短 deadline 的调用不回退（否则 300ms 超时会触发一次被丢弃的付费调用）
  return fallback && isFallbackEnabled()
    ? wrapWithFallback({
      primary,
      getFallback: getFallbackClient,
      breaker: getFallbackBreaker(),
      getRequestOptions: (timeoutMs) => getAIRequestOptions(timeoutMs),
      deadlineMs: kimiRequestTimeoutMs,
    })
    : primary;
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


const buildZeroTokenUsage = () => ({
  promptTokens: 0,
  outputTokens: 0,
});

const runThinkingChat = async ({ message, model, messages, onChunk, onThinking }) => {
  model = getAIModelOptions().model || model;
  const tokenUsage = buildZeroTokenUsage();
  const client = await getOpenAIClient();
  if (!client) {
    return {
      response: await generateLocalResponse(message),
      tokenUsage,
    };
  }

  try {
    const { maxTokens: configuredMaxTokens } = await getConfiguredModels();

    const streamResult = await collectStreamedChat({
      client,
      model,
      messages,
      onChunk,
      onThinking,
      isThinkingModel: true,
      maxTokens: configuredMaxTokens,
      modelOptions: getAIModelOptions(),
      requestOptions: getAIRequestOptions(),
    });

    tokenUsage.promptTokens = safeToNumber(streamResult.tokenUsage?.promptTokens);
    tokenUsage.outputTokens = streamResult.tokenUsage?.outputTokens ?? (usesUpstreamUsage() ? 0 : Math.ceil((streamResult.fullContent.length + streamResult.thinkingContent.length) / 2));

    return {
      response: streamResult.fullContent,
      tokenUsage,
      model: streamResult.servedBy?.model,
    };
  } catch (error) {
    console.error('流式调用失败:', { name: error.name, status: error.status || null });
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
      model: result.model,
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
  if (!getActiveAIConfig().apiKey && !isDeepSeek()) {
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

const resolveChatResult = async ({ userId, sessionId, message, imageUrl, useThinking, onChunk, onThinking, role }) => {
  const result = await runChatSession({
    role,
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
 * 职责：从 systemConfig 读取场景化 AI 模型配置与采样参数，带 30 秒内存缓存
 * 思路：
 *   - aiChatModel: AI 助手问答场景使用的模型
 *   - aiHsCodeModel: HS Code 推荐与申报要素场景使用的模型
 *   - 向后兼容旧的 aiPrimaryModel/aiFallbackModel（读取后映射为 chatModel/hsCodeModel）
 */
let _modelConfigCache = null;
let _modelConfigCacheAt = 0;
let _modelConfigCacheProvider = null;
const getConfiguredModels = async () => {
  const now = Date.now();
  const provider = getActiveAIConfig().provider || 'kimi';
  if (_modelConfigCache && _modelConfigCacheProvider === provider && now - _modelConfigCacheAt < 30_000) return _modelConfigCache;

  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ['aiChatModel', 'aiHsCodeModel', 'aiPrimaryModel', 'aiFallbackModel', 'aiTemperature', 'aiMaxTokens'] } },
    select: { key: true, value: true },
  });

  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

  // 场景化模型（优先读新 key，兼容旧 key）
  const profileModel = getAIModelOptions().model;
  const chatModelParsed = profileModel || parseStoredConfigValue(map.aiChatModel) || parseStoredConfigValue(map.aiPrimaryModel);
  const hsCodeModelParsed = profileModel || parseStoredConfigValue(map.aiHsCodeModel) || parseStoredConfigValue(map.aiFallbackModel) || parseStoredConfigValue(map.aiPrimaryModel);

  _modelConfigCache = {
    chatModel: (typeof chatModelParsed === 'string' && chatModelParsed) ? chatModelParsed : MODELS.default,
    hsCodeModel: (typeof hsCodeModelParsed === 'string' && hsCodeModelParsed) ? hsCodeModelParsed : MODELS.default,
    // 向后兼容：chatModel 同时作为 defaultModel 供 chatSession 使用
    defaultModel: (typeof chatModelParsed === 'string' && chatModelParsed) ? chatModelParsed : MODELS.default,
    thinkingModel: profileModel || MODELS.thinking,
    temperature: parseAiTemperature(map.aiTemperature),
    maxTokens: parseAiMaxTokens(map.aiMaxTokens),
  };
  _modelConfigCacheAt = now;
  _modelConfigCacheProvider = provider;
  return _modelConfigCache;
};

const runChatSession = async ({
  role,
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
    role,
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

  const { response: aiResponse, tokenUsage, model: servedModel } = await runChatModel({
    message,
    model,
    useThinking,
    messages,
    onChunk,
    onThinking,
  });
  // 实际作答的模型（回退成功时为 DeepSeek）用于用量、历史与 done.model；主调用成功时与原行为相同。
  const answeredModel = servedModel || model;

  const tokenRecord = buildTokenRecordArgs(userId, sessionId, answeredModel, tokenUsage, useThinking);
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
    modelUsed: answeredModel,
  });

  return {
    response: aiResponse,
    model: answeredModel,
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
const chat = async (userId, sessionId, message, imageUrl = null, role = null) => {
  const result = await resolveChatResult({
    role,
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
const chatStream = async (userId, sessionId, message, imageUrl = null, onChunk, onThinking = null, role = null) => {
  return resolveChatResult({
    role,
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
 * @param {string|null|undefined} [detailSnapshot] - 可选输出快照（如 HS 推荐 AI 原文），供用量详情展示
 */
const isMissingDetailSnapshotColumnError = (err) => {
  const m = String(err?.message || '');
  return (
    err?.code === 'P2022' ||
    m.includes('detailSnapshot') ||
    m.includes('detail_snapshot') ||
    (m.includes('no such column') && m.includes('detail'))
  );
};

const isMissingPromptBriefColumnError = (err) => {
  const m = String(err?.message || '');
  return (
    err?.code === 'P2022' ||
    m.includes('promptBrief') ||
    m.includes('prompt_brief') ||
    (m.includes('no such column') && m.includes('prompt'))
  );
};

const recordTokenUsage = async (
  userId,
  sessionId,
  model,
  tokenUsage,
  requestType,
  detailSnapshot,
  promptBrief,
) => {
  const snap =
    typeof detailSnapshot === 'string' && detailSnapshot.length > 0
      ? detailSnapshot.slice(0, 48000)
      : undefined;
  const brief =
    typeof promptBrief === 'string' && promptBrief.trim().length > 0
      ? promptBrief.trim().slice(0, 500)
      : undefined;
  const baseData = {
    userId,
    sessionId,
    model,
    promptTokens: tokenUsage.promptTokens,
    outputTokens: tokenUsage.outputTokens,
    totalTokens: tokenUsage.promptTokens + tokenUsage.outputTokens,
    requestType,
  };
  const extraAttempts = [];
  if (snap && brief) extraAttempts.push({ detailSnapshot: snap, promptBrief: brief });
  if (snap) extraAttempts.push({ detailSnapshot: snap });
  if (brief) extraAttempts.push({ promptBrief: brief });
  extraAttempts.push({});
  const seen = new Set();
  let lastErr = null;
  for (const extra of extraAttempts) {
    const key = JSON.stringify(extra);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await prisma.tokenUsage.create({ data: { ...baseData, ...extra } });
      return;
    } catch (err) {
      lastErr = err;
      if (isMissingPromptBriefColumnError(err) || isMissingDetailSnapshotColumnError(err)) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('tokenUsage.create failed');
};

/**
 * 职责：获取系统提示词
 */
/**
 * 职责：调用Kimi API（流式调用）
 * 思路：
 * 1. 使用OpenAI SDK进行流式请求
 * 2. 收集所有chunk并拼接完整响应
 * 3. 直接读取上游流式 usage，不串行追加 Token 估算请求
 * @param {Array} messages - 消息列表
 * @param {string} model - 模型名称
 * @returns {Object} { content, model, tokenUsage }
 */
const callKimiAPI = async (messages, model = MODELS.default) => {
  model = getAIModelOptions().model || model;
  const client = await getOpenAIClient();
  if (!client) {
    return {
      content: '抱歉，AI 服务未配置 API Key。',
      model,
      tokenUsage: { promptTokens: 0, outputTokens: 0 },
    };
  }

  const { temperature: configuredTemperature, maxTokens } = await getConfiguredModels();
  const temperature = typeof configuredTemperature === 'number' && Number.isFinite(configuredTemperature)
    ? configuredTemperature
    : 0.6;

  try {
    // 1. 使用流式调用
    const streamResult = await collectStreamedChat({
      client,
      model,
      messages,
      temperature,
      maxTokens,
      modelOptions: getAIModelOptions(),
      requestOptions: getAIRequestOptions(),
    });
    const fullContent = streamResult.fullContent;
    // ponytail: 上游未提供 usage 时仅保留输出估算；精确计费需要上游 usage。
    const tokenUsage = streamResult.tokenUsage || { promptTokens: 0, outputTokens: usesUpstreamUsage() ? 0 : Math.ceil(fullContent.length / 2) };
    
    return {
      content: fullContent || '抱歉，我暂时无法回答这个问题。',
      model: streamResult.servedBy?.model || model,
      tokenUsage,
    };
  } catch (error) {
    console.error('AI API调用失败:', { name: error.name, status: error.status || null });
    return {
      content: extractErrorMessage(error),
      model,
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
  if (usesUpstreamUsage()) {
    // ponytail: 字符长度只作保守上下文预算，精确计费必须使用 completion usage。
    return { data: { total_tokens: JSON.stringify(messages).length } };
  }
  const active = getActiveAIConfig();
  if (!active.apiKey || shouldForceLocalAI) {
    return { data: { total_tokens: 0 } };
  }
  
  try {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${active.apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    };

    const timeoutSignal = createTimeoutSignal(kimiRequestTimeoutMs);
    if (timeoutSignal) {
      requestOptions.signal = timeoutSignal;
    }

    const response = await fetch(`${active.baseUrl}/tokenizers/estimate-token-count`, requestOptions);
    
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
  
  // 汇率查询：只读唯一报价配置
  if (lowerMessage.includes('汇率')) {
    const rates = currentRates();
    return `当前现汇为${rates.spotRate}，调整${rates.adjustment}，实际报价汇率为${rates.effectiveRate}。`;
  }
  
  // 价格计算：唯一报价规则（加价、现汇调整、单价取整规则见 exportPricing.roundUnitPrice）
  if (lowerMessage.includes('价格') || lowerMessage.includes('售价')) {
    const numbers = message.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      const cost = parseFloat(numbers[0]);
      const priced = priceFor({ costCny: cost });
      if (priced.status !== 'OK') return '请提供大于0的单位采购成本（人民币），我来帮您按报价规则计算售价。';
      return `成本${cost}元，按报价规则（加价${Math.round(priced.markup * 100)}%、报价汇率${priced.effectiveRate}，单价分档就近取整）计算，推荐售价为 $${priced.unitPriceUsd}${priced.roundingWarning ? `。${priced.roundingWarning}` : ''}`;
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
    return (Object.hasOwn(parseInputPromptMap, type) ? parseInputPromptMap[type](content) : content);
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
  if (!getActiveAIConfig().apiKey && !isDeepSeek()) {
    return parseLocally(content, type);
  }
  
  const model = imageUrl ? MODELS.vision : MODELS.fast;
  const userContent = buildInputContent(content, type, imageUrl);
  
  try {
    const result = await callKimiAPI([
      { role: 'system', content: '你是一个数据解析助手，请从用户提供的文本或图片中提取结构化信息，以JSON格式返回。' },
      { role: 'user', content: userContent },
    ], model);
    
    // 记录Token消耗（附输出快照，便于「其他 AI 调用」详情查看）
    if (userId && result.tokenUsage.promptTokens > 0) {
      await recordTokenUsage(
        userId,
        null,
        result.model || model,
        result.tokenUsage,
        'parse',
        result.content,
        typeof content === 'string' ? content.slice(0, 400) : undefined,
      );
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
 * 职责：简单非流式 AI 调用（供内部其他模块使用）
 * @param {Array} messages - OpenAI 格式的消息列表
 * @param {string} [model] - 使用的模型（默认 MODELS.fast）
 * @returns {{ content: string, model: string, tokenUsage: { promptTokens: number, outputTokens: number } }}
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
  getConfiguredModels,
  MODELS,
  recordTokenUsage,
  getOpenAIClient,
  getAIRequestOptions,
  getAIModelOptions,
};
