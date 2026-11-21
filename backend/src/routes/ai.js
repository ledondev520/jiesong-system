/**
 * Input: AI控制器
 * Output: AI助手路由
 * Pos: AI路由，处理智能问答和辅助录入（含图像）
 */

const { Router } = require('express');
const aiController = require('../controllers/aiController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { ROLE_SETS } = require('../middleware/roleAuth');
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
router.post('/chat', roleAuth(ROLE_SETS.ALL), [
  body('message').notEmpty().withMessage('消息不能为空'),
], handleValidation, aiController.chat);

// POST /api/v1/ai/parse - 解析输入内容（辅助录入，支持图片）
router.post('/parse', roleAuth(ROLE_SETS.ALL), [
  body('type').notEmpty().withMessage('解析类型不能为空'),
], handleValidation, aiController.parseInput);

// GET /api/v1/ai/agents/tools - 获取 Agent 工具注册表
router.get('/agents/tools', roleAuth(ROLE_SETS.ALL), aiController.agentToolRegistry);

// POST /api/v1/ai/agents/prompt-stream - SSE 流式运行预置业务 Agent
router.post('/agents/prompt-stream', roleAuth(ROLE_SETS.ALL), [
  body('agentType').optional().isIn(SUPPORTED_AGENT_TYPES).withMessage('agentType 不合法'),
  body('message').notEmpty().withMessage('消息不能为空'),
], handleValidation, aiController.agentPromptStream);

// POST /api/v1/ai/agents/execute-action - 执行用户确认后的 Agent 写操作
router.post('/agents/execute-action', roleAuth(ROLE_SETS.ALL), [
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
router.post('/agents/cancel-action', roleAuth(ROLE_SETS.ALL), [
  body('actionId').notEmpty().withMessage('actionId 不能为空'),
], handleValidation, aiController.cancelAgentAction);

// GET /api/v1/ai/history - 获取对话历史
router.get('/history', aiController.getChatHistory);

// GET /api/v1/ai/sessions - 获取会话列表
router.get('/sessions', aiController.getSessions);

// GET /api/v1/ai/standalone-token-usage - 无聊天会话绑定的 Token 记录（HS 推荐等）
router.get('/standalone-token-usage', aiController.getStandaloneTokenUsage);

// DELETE /api/v1/ai/sessions/:sessionId - 删除会话
router.delete('/sessions/:sessionId', roleAuth(ROLE_SETS.ALL), withAuditLog(
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

// GET /api/v1/ai/token-stats - 获取Token使用统计
router.get('/token-stats', aiController.getTokenStats);

// GET /api/v1/ai/models - 获取可用模型列表
router.get('/models', aiController.getModels);

// ─── AI 用量统计路由 ───

module.exports = router;
