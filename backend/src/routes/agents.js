/**
 * Input: Agent 管理控制器
 * Output: Agent 账号与凭证管理路由
 * Pos: 后端 Agent 管理 API
 */

const { Router } = require('express');
const agentController = require('../controllers/agentController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withAuditLog } = require('../middleware/auditLog');
const { body, handleValidation, withIdValidation, withPaginationValidation } = require('../utils/validators');

const router = Router();

router.use(authenticate);
router.use(roleAuth('ADMIN'));

router.get('/', withPaginationValidation, agentController.list);
router.get('/:id', withIdValidation, agentController.getById);

router.post('/', [
  body('name').notEmpty().withMessage('Agent 名称不能为空'),
  body('slug').notEmpty().withMessage('Agent slug 不能为空'),
], handleValidation, withAuditLog(
  {
    entity: 'AgentAccount',
    action: 'CREATE',
    getNewValue: ({ responseData, defaultValue }) => responseData || defaultValue,
  },
  agentController.create
));

router.put('/:id', withIdValidation, withAuditLog(
  {
    entity: 'AgentAccount',
    action: 'UPDATE',
    getNewValue: ({ responseData, defaultValue }) => responseData || defaultValue,
  },
  agentController.update
));

router.post('/:id/credentials', [
  withIdValidation,
  body('expiresInDays').optional().isInt({ min: 1, max: 365 }).withMessage('expiresInDays 必须在 1-365 之间'),
  handleValidation,
], withAuditLog(
  {
    entity: 'AgentCredential',
    action: 'CREATE',
    getEntityId: ({ responseData }) => responseData?.credential?.id || null,
    getNewValue: ({ responseData, defaultValue }) => responseData || defaultValue,
  },
  agentController.issueCredential
));

router.post('/credentials/:credentialId/revoke', withAuditLog(
  {
    entity: 'AgentCredential',
    action: 'UPDATE',
    idParam: 'credentialId',
    getEntityId: ({ req }) => req.params.credentialId,
  },
  agentController.revokeCredential
));

router.post('/credentials/:credentialId/rotate', [
  body('expiresInDays').optional().isInt({ min: 1, max: 365 }).withMessage('expiresInDays 必须在 1-365 之间'),
  handleValidation,
], withAuditLog(
  {
    entity: 'AgentCredential',
    action: 'ROTATE',
    idParam: 'credentialId',
    getEntityId: ({ req }) => req.params.credentialId,
    getNewValue: ({ responseData, defaultValue }) => responseData || defaultValue,
  },
  agentController.rotateCredential
));

module.exports = router;
