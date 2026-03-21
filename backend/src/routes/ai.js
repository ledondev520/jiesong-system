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

const router = Router();

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

module.exports = router;
