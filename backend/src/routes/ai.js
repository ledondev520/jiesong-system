/**
 * Input: AI控制器
 * Output: AI助手路由
 * Pos: AI路由，处理智能问答和辅助录入（含图像）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const aiController = require('../controllers/aiController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { body, handleValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');
const { SUPPORTED_AGENT_TYPES } = require('../services/openAgentService');
const { isValidOpenAgentRuntimeToken } = require('../utils/openAgentRuntimeAuth');

const router = Router();

const authenticateOpenAgentRuntime = (req, res, next) => {
  const token = req.get('x-api-key');
  if (!isValidOpenAgentRuntimeToken(token)) {
    return res.status(401).json({
      code: 401,
      message: 'invalid open-agent runtime token',
    });
  }
  return next();
};

// Internal Anthropic-compatible shim for open-agent-sdk -> current Kimi/OpenAI-compatible API
router.post('/anthropic/v1/messages', authenticateOpenAgentRuntime, aiController.anthropicCompatMessage);
router.post('/anthropic/v1/messages/count_tokens', authenticateOpenAgentRuntime, aiController.anthropicCompatCountTokens);

router.use(authenticate);

// POST /api/v1/ai/chat - 智能问答（支持图片）
router.post('/chat', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('message').notEmpty().withMessage('消息不能为空'),
], handleValidation, aiController.chat);

// POST /api/v1/ai/chat/stream - 流式智能问答（SSE）
router.post('/chat/stream', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('message').notEmpty().withMessage('消息不能为空'),
], handleValidation, aiController.chatStream);

// POST /api/v1/ai/parse - 解析输入内容（辅助录入，支持图片）
router.post('/parse', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('type').notEmpty().withMessage('解析类型不能为空'),
], handleValidation, aiController.parseInput);

// POST /api/v1/ai/agents/prompt - 运行预置业务 Agent（agentType 可选，默认 unified）
router.post('/agents/prompt', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('agentType').optional().isIn(SUPPORTED_AGENT_TYPES).withMessage('agentType 不合法'),
  body('message').notEmpty().withMessage('消息不能为空'),
], handleValidation, aiController.agentPrompt);

// GET /api/v1/ai/agents/tools - 获取 Agent 工具注册表
router.get('/agents/tools', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), aiController.agentToolRegistry);

// POST /api/v1/ai/agents/prompt-stream - SSE 流式运行预置业务 Agent
router.post('/agents/prompt-stream', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('agentType').optional().isIn(SUPPORTED_AGENT_TYPES).withMessage('agentType 不合法'),
  body('message').notEmpty().withMessage('消息不能为空'),
], handleValidation, aiController.agentPromptStream);

// POST /api/v1/ai/agents/execute-action - 执行用户确认后的 Agent 写操作
router.post('/agents/execute-action', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('actionId').notEmpty().withMessage('actionId 不能为空'),
], handleValidation, withAuditLog(
  {
    entity: 'AgentWriteAction',
    action: 'EXECUTE',
    captureBefore: false,
    captureAfter: false,
    getEntityId: ({ req }) => req.body?.actionId || null,
  },
  aiController.executeAgentAction
));

// POST /api/v1/ai/agents/cancel-action - 取消一个待确认的 Agent 写操作
router.post('/agents/cancel-action', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), [
  body('actionId').notEmpty().withMessage('actionId 不能为空'),
], handleValidation, aiController.cancelAgentAction);

// GET /api/v1/ai/history - 获取对话历史
router.get('/history', aiController.getChatHistory);

// GET /api/v1/ai/sessions - 获取会话列表
router.get('/sessions', aiController.getSessions);

// GET /api/v1/ai/standalone-token-usage - 无聊天会话绑定的 Token 记录（HS 推荐等）
router.get('/standalone-token-usage', aiController.getStandaloneTokenUsage);

// DELETE /api/v1/ai/sessions/:sessionId - 删除会话
router.delete('/sessions/:sessionId', roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'), withAuditLog(
  {
    entity: 'ChatSession',
    action: 'DELETE',
    idParam: 'sessionId',
    captureBefore: false,
    captureAfter: false,
    getEntityId: ({ req }) => req.params?.sessionId || null,
    getOldValue: ({ req }) => ({
      sessionId: req.params?.sessionId || null,
      userId: req.user?.id || null,
    }),
  },
  aiController.deleteSession
));

// PUT /api/v1/ai/config - 配置AI设置（仅管理员）
router.put('/config', roleAuth('ADMIN'), withAuditLog(
  {
    entity: 'SystemConfig',
    action: 'UPDATE',
    model: 'systemConfig',
    captureBefore: true,
    captureAfter: true,
    getEntityId: () => 'kimiApiKey',
    beforeWhere: () => ({ key: 'kimiApiKey' }),
    afterWhere: () => ({ key: 'kimiApiKey' }),
  },
  aiController.updateConfig
));

// GET /api/v1/ai/token-stats - 获取Token使用统计
router.get('/token-stats', aiController.getTokenStats);

// GET /api/v1/ai/models - 获取可用模型列表
router.get('/models', aiController.getModels);

// GET /api/v1/ai/greeting - 获取AI问候语（带五月天歌词）
router.get('/greeting', aiController.getGreeting);

// GET /api/v1/ai/greeting/stream - 流式获取AI问候语（支持 thinking）
router.get('/greeting/stream', aiController.getGreetingStream);

// ─── AI 用量统计路由 ───
const aiUsageController = require('../controllers/aiUsageController');

// GET /api/v1/ai/usage/trend - 用量趋势（按日期聚合）
router.get('/usage/trend', aiUsageController.getUsageTrend);

// GET /api/v1/ai/usage/calls - 调用明细列表
router.get('/usage/calls', aiUsageController.getCallDetails);

// GET /api/v1/ai/usage/summary - 用量汇总（今日/本周/本月/总计）
router.get('/usage/summary', aiUsageController.getUsageSummary);

module.exports = router;
