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
const openAgentService = require('../services/openAgentService');
const anthropicCompatService = require('../services/anthropicCompatService');
const { buildGovernanceReplayProfile } = require('../services/governanceReplayService');
const { normalizeConfigValueForStorage } = require('../utils/secretCrypto');

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed > 0 ? parsed : fallback;
};

const parseMessage = (body) => {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw createError('message 不能为空', 400);
  }
  return message;
};

const parseContent = (body) => {
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) {
    throw createError('content 不能为空', 400);
  }
  return content;
};

const parseAgentType = (body) => {
  const agentType = typeof body?.agentType === 'string' ? body.agentType.trim() : '';
  return agentType || 'unified';
};

const setSseHeaders = (res) => {
  Object.entries(SSE_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.flushHeaders();
};

const sendSseMessage = (res, payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

const PENDING_ACTION_EVENT_STATUS = {
  AGENT_WRITE_EXECUTE: 'executed',
  AGENT_WRITE_CANCEL: 'cancelled',
  AGENT_WRITE_FAILED: 'failed',
};

const parseJsonSafely = (value) => {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};

const parseAgentMetadata = (raw) => {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      agentType: parsed?.agentType || null,
      routePlan: parsed?.routePlan || null,
      selectedToolNames: Array.isArray(parsed?.selectedToolNames) ? parsed.selectedToolNames : [],
      toolTraceSummary: parsed?.toolTraceSummary || null,
      actionRecommendations: Array.isArray(parsed?.actionRecommendations) ? parsed.actionRecommendations : [],
      pendingActionSummary: Array.isArray(parsed?.pendingActionSummary) ? parsed.pendingActionSummary : [],
      governanceReplayProfile: parsed?.governanceReplayProfile || null,
    };
  } catch {
    return {};
  }
};

const buildPendingActionOutcomeMap = async (userId, actionIds = []) => {
  const uniqueIds = Array.from(new Set((Array.isArray(actionIds) ? actionIds : []).filter(Boolean)));
  if (!userId || uniqueIds.length === 0) return new Map();

  const rows = await prisma.operationLog.findMany({
    where: {
      userId,
      entityId: { in: uniqueIds },
      action: { in: Object.keys(PENDING_ACTION_EVENT_STATUS) },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      entityId: true,
      action: true,
      newValue: true,
      createdAt: true,
    },
  });

  const map = new Map();
  rows.forEach((row) => {
    const details = parseJsonSafely(row.newValue) || {};
    const current = map.get(row.entityId) || {
      latest: null,
      events: [],
    };
    const status = details?.status || PENDING_ACTION_EVENT_STATUS[row.action] || 'pending';
    const resultDetail = details?.result?.detail || details?.detail || null;
    current.events.push({
      type: status,
      status,
      detail: resultDetail,
      at: row.createdAt,
    });
    if (!current.latest) {
      current.latest = {
        status,
        resultDetail,
      };
    }
    map.set(row.entityId, current);
  });
  return map;
};

const buildPersistedReplayProfileMap = async (userId, sessionIds = []) => {
  const uniqueIds = Array.from(new Set((Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean)));
  if (!userId || uniqueIds.length === 0) return new Map();

  const rows = await prisma.operationLog.findMany({
    where: {
      userId,
      action: { in: ['AGENT_REPLAY_SNAPSHOT', 'AGENT_RUN'] },
      entity: { in: ['AgentRuntimeReplay', 'AgentRuntime'] },
      entityId: { in: uniqueIds },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      entityId: true,
      action: true,
      newValue: true,
      createdAt: true,
    },
  });

  const map = new Map();
  rows.forEach((row) => {
    const details = parseJsonSafely(row.newValue) || {};
    if (!details?.governanceReplayProfile) return;
    const next = {
      profile: details.governanceReplayProfile,
      source: row.action === 'AGENT_REPLAY_SNAPSHOT' ? 'replay-snapshot-log' : 'agent-run-log',
    };
    const current = map.get(row.entityId);
    if (!current) {
      map.set(row.entityId, next);
      return;
    }
    if (current.source === 'agent-run-log' && next.source === 'replay-snapshot-log') {
      map.set(row.entityId, next);
    }
  });

  return map;
};

const buildReplaySummaryProfileMap = async (userId, sessionIds = []) => {
  const uniqueIds = Array.from(new Set((Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean)));
  if (!userId || uniqueIds.length === 0 || !prisma.agentReplaySummary?.findMany) return new Map();

  const rows = await prisma.agentReplaySummary.findMany({
    where: {
      userId,
      sessionId: { in: uniqueIds },
    },
    select: {
      sessionId: true,
      profileJson: true,
    },
  });

  const map = new Map();
  rows.forEach((row) => {
    const profile = parseJsonSafely(row.profileJson);
    if (!profile) return;
    map.set(row.sessionId, {
      profile,
      source: 'replay-summary-record',
    });
  });

  return map;
};

const resolvePersistedReplayFallback = (metadata, replaySummaryMap, replayMap, sessionId) => {
  if (metadata?.governanceReplayProfile) {
    return {
      profile: null,
      source: null,
    };
  }
  const summaryFallback = replaySummaryMap.get(sessionId) || null;
  if (summaryFallback) {
    return {
      profile: summaryFallback.profile,
      source: summaryFallback.source,
    };
  }
  const fallback = replayMap.get(sessionId) || null;
  if (!fallback) {
    return {
      profile: null,
      source: null,
    };
  }
  return {
    profile: fallback.profile,
    source: fallback.source,
  };
};

const mergePendingActionSummary = (items = [], outcomeMap = new Map()) => (
  (Array.isArray(items) ? items : []).map((item) => {
    const outcome = outcomeMap.get(item?.actionId);
    const createdEvent = item?.createdAt ? [{
      type: 'created',
      status: 'pending',
      detail: item.description,
      at: item.createdAt,
    }] : [];
    if (!outcome) {
      return {
        ...item,
        timeline: createdEvent,
      };
    }
    return {
      ...item,
      status: outcome.latest?.status || item.status,
      resultDetail: outcome.latest?.resultDetail || item.resultDetail || null,
      timeline: [...createdEvent, ...(outcome.events || []).reverse()],
    };
  })
);

/**
 * 职责：智能问答（支持图片）
 * 思路：
 * 1. 解析请求参数
 * 2. 调用aiService处理对话
 * 3. 返回响应和Token消耗
 */
const chat = async (req, res, next) => {
  try {
    const message = parseMessage(req.body);
    const { sessionId, imageUrl } = req.body;
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
 * 职责：流式智能问答（SSE，支持 thinking 展示）
 * 思路：
 * 1. 设置SSE响应头
 * 2. 调用aiService的流式聊天
 * 3. 分别发送 thinking 和 content 给前端
 */
const chatStream = async (req, res) => {
  try {
    const message = parseMessage(req.body);
    const { sessionId, imageUrl } = req.body;
    const userId = req.user.id;
    
    // 生成会话ID
    const currentSessionId = sessionId || `session_${Date.now()}`;
    
    setSseHeaders(res);
    
    // 发送sessionId
    sendSseMessage(res, { type: 'session', sessionId: currentSessionId });
    
    // 发送开始处理消息
    sendSseMessage(res, { type: 'start', message: '开始处理...' });
    
    // 流式调用AI服务（支持 thinking）
    const result = await aiService.chatStream(
      userId, 
      currentSessionId, 
      message, 
      imageUrl,
      // onChunk - 最终内容回调
      (chunk) => {
        sendSseMessage(res, { type: 'chunk', content: chunk });
      },
      // onThinking - 思考过程回调
      (thinking) => {
        sendSseMessage(res, { type: 'thinking', content: thinking });
      }
    );
    
    // 发送完成消息
    sendSseMessage(res, { type: 'done', tokenUsage: result.tokenUsage, model: result.model });
    
    res.end();
  } catch (error) {
    sendSseMessage(res, { type: 'error', message: error.message });
    res.end();
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
    const content = parseContent(req.body);
    const { type, imageUrl } = req.body;
    const userId = req.user.id;
    
    const parsed = await aiService.parseInput(content, type, imageUrl, userId);
    
    success(res, parsed);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：运行预置业务 Agent
 * 思路：
 * 1. 校验 agentType / message
 * 2. 调用 openAgentService 执行一次 in-process agent prompt
 * 3. 返回会话、回答、token 用量与 Agent 类型
 */
const agentPrompt = async (req, res, next) => {
  try {
    const message = parseMessage(req.body);
    const agentType = parseAgentType(req.body);
    const result = await openAgentService.runAgentPrompt({
      userId: req.user.id,
      userRole: req.user.role,
      agentType,
      message,
      sessionId: req.body?.sessionId,
    });
    success(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：返回当前通用 Agent 的工具注册表，供治理与观测使用
 */
const agentToolRegistry = async (req, res, next) => {
  try {
    success(res, openAgentService.buildToolRegistryPayload(req.user?.role || null));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：SSE 流式运行预置业务 Agent
 * 思路：
 *   1. 设置 SSE 响应头
 *   2. 迭代 openAgentService.runAgentPromptStream 生成器
 *   3. 逐条 yield 事件写入 SSE
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const agentPromptStream = async (req, res) => {
  setSseHeaders(res);
  try {
    const message = parseMessage(req.body);
    const agentType = parseAgentType(req.body);
    const gen = openAgentService.runAgentPromptStream({
      userId: req.user.id,
      userRole: req.user.role,
      agentType,
      message,
      sessionId: req.body?.sessionId,
      imageUrl: req.body?.imageUrl,
    });
    for await (const event of gen) {
      sendSseMessage(res, event);
    }
    res.end();
  } catch (error) {
    sendSseMessage(res, { type: 'error', message: error.message });
    res.end();
  }
};

/**
 * 职责：执行用户确认后的 Agent 写操作
 * 思路：
 *   1. 从 body 获取 actionId
 *   2. 调用 openAgentService.executeAction 执行
 *   3. 返回执行结果
 */
const executeAgentAction = async (req, res, next) => {
  try {
    const { actionId } = req.body;
    if (!actionId || typeof actionId !== 'string') {
      throw createError('actionId 不能为空', 400);
    }
    const result = await openAgentService.executeAction(actionId, req.user.id);
    success(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：取消一个待确认的 Agent 写操作
 */
const cancelAgentAction = async (req, res, next) => {
  try {
    const { actionId } = req.body;
    if (!actionId || typeof actionId !== 'string') {
      throw createError('actionId 不能为空', 400);
    }
    await openAgentService.cancelAction(actionId, req.user.id);
    success(res, null, '操作已取消');
  } catch (error) {
    next(error);
  }
};

const anthropicCompatMessage = async (req, res, next) => {
  try {
    const result = await anthropicCompatService.createMessage(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const anthropicCompatCountTokens = async (req, res, next) => {
  try {
    const result = await anthropicCompatService.countTokens(req.body);
    res.status(200).json(result);
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
    const parsedPage = parsePositiveInt(page, 1);
    const parsedPageSize = parsePositiveInt(pageSize, 50);
    const skip = (parsedPage - 1) * parsedPageSize;
    
    const where = { userId: req.user.id };
    if (sessionId) where.sessionId = sessionId;
    
    const [messages, total] = await Promise.all([
      prisma.chatHistory.findMany({
        where,
        skip,
        take: parsedPageSize,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          sessionId: true,
          role: true,
          content: true,
          imageUrl: true,
          metadata: true,
          promptTokens: true,
          outputTokens: true,
          modelUsed: true,
          createdAt: true,
        },
      }),
      prisma.chatHistory.count({ where }),
    ]);

    const parsedMessages = messages.map((item) => ({
      ...item,
      parsedMetadata: parseAgentMetadata(item.metadata),
    }));
    const actionIds = parsedMessages.flatMap((item) =>
      (item.parsedMetadata.pendingActionSummary || []).map((summary) => summary.actionId)
    );
    const outcomeMap = await buildPendingActionOutcomeMap(req.user.id, actionIds);
    const replaySummaryMap = await buildReplaySummaryProfileMap(
      req.user.id,
      Array.from(new Set(parsedMessages.map((item) => item.sessionId).filter(Boolean))),
    );
    const persistedReplayProfileMap = await buildPersistedReplayProfileMap(
      req.user.id,
      Array.from(new Set(parsedMessages.map((item) => item.sessionId).filter(Boolean))),
    );
    const enrichedMessages = parsedMessages.map((item) => {
      const pendingActionSummary = mergePendingActionSummary(item.parsedMetadata.pendingActionSummary, outcomeMap);
      const replayFallback = resolvePersistedReplayFallback(item.parsedMetadata, replaySummaryMap, persistedReplayProfileMap, item.sessionId);
      const replayProfile = buildGovernanceReplayProfile(item.parsedMetadata, {
        pendingActionSummary,
        persistedProfile: replayFallback.profile,
        persistedSource: replayFallback.source,
      });
      return {
        ...item,
        ...item.parsedMetadata,
        governanceReplayAvailable: replayProfile.available,
        governanceReplaySummary: replayProfile.summary,
        governanceReplayCounts: replayProfile.counts,
        governanceReplayLevel: replayProfile.level,
        governanceReplaySource: replayProfile.source,
        governanceReplayProfile: replayProfile,
        pendingActionSummary,
        parsedMetadata: undefined,
      };
    });

    paginated(res, enrichedMessages, total, parsedPage, parsedPageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取会话列表（含每个会话的 token 总量）
 * 思路：
 * 1. 从 ChatHistory 获取分组后的会话元数据
 * 2. 从 TokenUsage 聚合每个 sessionId 的 token 总数
 * 3. 合并后返回
 */
const getSessions = async (req, res, next) => {
  try {
    // 1. 获取会话基础信息（消息数、最近时间）
    const sessions = await prisma.chatHistory.groupBy({
      by: ['sessionId'],
      where: { userId: req.user.id },
      _max: { createdAt: true },
      _count: true,
      orderBy: { _max: { createdAt: 'desc' } },
    });

    // 2. 获取每个会话的 token 汇总 + 最常用模型
    const tokensBySession = await prisma.tokenUsage.groupBy({
      by: ['sessionId'],
      where: {
        userId: req.user.id,
        sessionId: { in: sessions.map(s => s.sessionId) },
      },
      _sum: { totalTokens: true },
    });

    // 2.1. 每个会话「最近一次」使用的模型（按 createdAt 倒序扫描，避免 distinct 语义不确定）
    const sessionIds = sessions.map(s => s.sessionId);
    const modelMap = {};
    if (sessionIds.length > 0) {
      const tokenRows = await prisma.tokenUsage.findMany({
        where: {
          userId: req.user.id,
          sessionId: { in: sessionIds },
        },
        orderBy: { createdAt: 'desc' },
        select: { sessionId: true, model: true },
      });
      for (const row of tokenRows) {
        if (modelMap[row.sessionId] === undefined) {
          modelMap[row.sessionId] = row.model;
        }
      }
    }

    // 3. 每个会话的第一条用户消息（作为预览标题）
    const previewMap = {};
    if (sessionIds.length > 0) {
      const firstMessages = await prisma.chatHistory.findMany({
        where: {
          userId: req.user.id,
          sessionId: { in: sessionIds },
          role: 'user',
        },
        orderBy: { createdAt: 'asc' },
        select: { sessionId: true, content: true, metadata: true },
      });
      for (const row of firstMessages) {
        if (!previewMap[row.sessionId]) {
          previewMap[row.sessionId] = {
            text: row.content?.slice(0, 60) || '',
            metadata: parseAgentMetadata(row.metadata),
          };
        }
      }
    }

    // 4. 建立映射
    const tokenMap = Object.fromEntries(
      tokensBySession.map(t => [t.sessionId, t._sum.totalTokens || 0])
    );
    const pendingActionIds = Object.values(previewMap).flatMap((item) =>
      (item?.metadata?.pendingActionSummary || []).map((summary) => summary.actionId)
    );
    const outcomeMap = await buildPendingActionOutcomeMap(req.user.id, pendingActionIds);
    const replaySummaryMap = await buildReplaySummaryProfileMap(
      req.user.id,
      sessions.map((s) => s.sessionId),
    );
    const persistedReplayProfileMap = await buildPersistedReplayProfileMap(
      req.user.id,
      sessions.map((s) => s.sessionId),
    );

    // 5. 合并后返回
    const enrichedSessions = sessions.map((s) => {
      const pendingActionSummary = mergePendingActionSummary(previewMap[s.sessionId]?.metadata?.pendingActionSummary, outcomeMap);
      const replayFallback = resolvePersistedReplayFallback(
        previewMap[s.sessionId]?.metadata,
        replaySummaryMap,
        persistedReplayProfileMap,
        s.sessionId,
      );
      const replayProfile = buildGovernanceReplayProfile(previewMap[s.sessionId]?.metadata, {
        pendingActionSummary,
        persistedProfile: replayFallback.profile,
        persistedSource: replayFallback.source,
      });
      return {
        ...s,
        totalTokens: tokenMap[s.sessionId] || 0,
        lastModel: modelMap[s.sessionId] || null,
        preview: previewMap[s.sessionId]?.text || '',
        agentType: previewMap[s.sessionId]?.metadata?.agentType || null,
        routePlan: previewMap[s.sessionId]?.metadata?.routePlan || null,
        toolsUsed: previewMap[s.sessionId]?.metadata?.selectedToolNames || [],
        routeMode: previewMap[s.sessionId]?.metadata?.routePlan?.mode || null,
        domainsTouched: previewMap[s.sessionId]?.metadata?.routePlan?.selectedDomains || [],
        toolTraceSummary: previewMap[s.sessionId]?.metadata?.toolTraceSummary || null,
        actionRecommendations: previewMap[s.sessionId]?.metadata?.actionRecommendations || [],
        governanceReplayAvailable: replayProfile.available,
        governanceReplaySummary: replayProfile.summary,
        governanceReplayCounts: replayProfile.counts,
        governanceReplayLevel: replayProfile.level,
        governanceReplaySource: replayProfile.source,
        governanceReplayProfile: replayProfile,
        pendingActionSummary,
      };
    });

    success(res, enrichedSessions);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：列出未绑定聊天会话的 Token 记录（如 HS 编码推荐、辅助解析等）
 * 思路：
 * 1. sessionId 为 null 的 tokenUsage 不会出现在 getSessions（基于 ChatHistory）中
 * 2. 按时间倒序返回，供「AI 用量」页展示完整消耗来源
 * @param {import('express').Request} req - query.limit 可选，默认 50，最大 200
 */
const getStandaloneTokenUsage = async (req, res, next) => {
  try {
    const limit = Math.min(parsePositiveInt(req.query.limit, 50), 200);
    const where = {
      userId: req.user.id,
      sessionId: null,
    };
    const selectFull = {
      id: true,
      model: true,
      promptTokens: true,
      outputTokens: true,
      totalTokens: true,
      requestType: true,
      detailSnapshot: true,
      promptBrief: true,
      createdAt: true,
    };
    const selectWithoutBrief = {
      id: true,
      model: true,
      promptTokens: true,
      outputTokens: true,
      totalTokens: true,
      requestType: true,
      detailSnapshot: true,
      createdAt: true,
    };
    const selectBase = {
      id: true,
      model: true,
      promptTokens: true,
      outputTokens: true,
      totalTokens: true,
      requestType: true,
      createdAt: true,
    };
    let rows;
    try {
      rows = await prisma.tokenUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: selectFull,
      });
    } catch (err) {
      if (aiService.isMissingPromptBriefColumnError(err)) {
        try {
          rows = await prisma.tokenUsage.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: selectWithoutBrief,
          });
          rows = rows.map((r) => ({ ...r, promptBrief: null }));
        } catch (err2) {
          if (aiService.isMissingDetailSnapshotColumnError(err2)) {
            rows = await prisma.tokenUsage.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: selectBase,
            });
            rows = rows.map((r) => ({ ...r, detailSnapshot: null, promptBrief: null }));
          } else {
            throw err2;
          }
        }
      } else if (aiService.isMissingDetailSnapshotColumnError(err)) {
        rows = await prisma.tokenUsage.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: selectBase,
        });
        rows = rows.map((r) => ({ ...r, detailSnapshot: null, promptBrief: null }));
      } else {
        throw err;
      }
    }
    success(res, rows);
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
 * 思路：
 * 1. 更新 Kimi / MiniMax API Key
 * 2. 更新模型优先级（primaryModel、fallbackModel）
 */
const updateConfig = async (req, res, next) => {
  try {
    const { apiKey, baseUrl, minimaxApiKey, primaryModel, fallbackModel } = req.body;

    const upsertConfig = async (key, value, note) => {
      const stored = normalizeConfigValueForStorage(key, value);
      await prisma.systemConfig.upsert({
        where: { key },
        update: { value: stored, note },
        create: { key, value: stored, note },
      });
    };

    if (apiKey) await upsertConfig('kimiApiKey', apiKey, 'Kimi API Key (加密存储)');
    if (minimaxApiKey) await upsertConfig('minimaxApiKey', minimaxApiKey, 'MiniMax API Key (加密存储)');
    if (primaryModel) await upsertConfig('aiPrimaryModel', primaryModel, 'AI 首选模型');
    if (fallbackModel !== undefined) await upsertConfig('aiFallbackModel', fallbackModel, 'AI 备用模型');

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
    
    const parsedDays = parsePositiveInt(days, 30);
    const stats = await aiService.getTokenStats(userId, parsedDays);
    
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

/**
 * 职责：获取AI问候语（带五月天歌词）
 */
const getGreeting = async (req, res, next) => {
  try {
    const result = await aiService.generateGreeting();
    
    success(res, {
      greeting: result.greeting,
      songName: result.songName,
      lyrics: result.lyrics,
      source: result.source,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：流式获取AI问候语（支持 thinking 展示）
 * 思路：
 * 1. 使用 SSE 流式返回
 * 2. 先返回 thinking 内容
 * 3. 再返回最终内容
 */
const getGreetingStream = async (req, res) => {
  // 设置 SSE 响应头
  setSseHeaders(res);

  try {
    await aiService.generateGreetingStream(
      // onThinking - 思考过程回调
      (chunk) => {
        sendSseMessage(res, { type: 'thinking', content: chunk });
      },
      // onContent - 最终内容回调
      (chunk) => {
        sendSseMessage(res, { type: 'content', content: chunk });
      },
      // onDone - 完成回调
      (result) => {
        sendSseMessage(res, {
          type: 'done',
          greeting: result.greeting,
          songName: result.songName,
          lyrics: result.lyrics,
          source: result.source,
        });
        res.end();
      }
    );
  } catch (error) {
    sendSseMessage(res, { type: 'error', message: error.message });
    res.end();
  }
};

module.exports = {
  chat,
  chatStream,
  parseInput,
  agentPrompt,
  agentToolRegistry,
  agentPromptStream,
  executeAgentAction,
  cancelAgentAction,
  anthropicCompatMessage,
  anthropicCompatCountTokens,
  getChatHistory,
  getSessions,
  getStandaloneTokenUsage,
  deleteSession,
  updateConfig,
  getTokenStats,
  getModels,
  getGreeting,
  getGreetingStream,
};
