/**
 * Input: opsExecutionController
 * Output: 经营执行中台 API 路由
 * Pos: 路由层定义
 */

const express = require('express');
const controller = require('../controllers/opsExecutionController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withPaginationValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = express.Router();

router.use(authenticate);
router.use(roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'));

router.get('/unshipped', withPaginationValidation, controller.getUnshippedList);

router.put('/unshipped/assign', withAuditLog(
  {
    entity: 'OpsExecution',
    action: 'ASSIGN',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req }) => ({
      salesContractId: req.body?.salesContractId || null,
      productId: req.body?.productId || null,
      status: req.body?.status || null,
      assigneeName: req.body?.assigneeName || null,
    }),
  },
  controller.assignUnshippedAssignee
));

router.get('/purchase-checklist/templates', controller.getPurchaseChecklistTemplates);
router.post('/purchase-checklist/generate', controller.generatePurchaseChecklist);
router.post('/purchase-checklist/export', controller.exportPurchaseChecklist);
router.put('/purchase-checklist/templates', withAuditLog(
  {
    entity: 'OpsExecutionPurchaseTemplate',
    action: 'UPSERT',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req }) => ({
      storeType: req.body?.storeType || null,
      openingStage: req.body?.openingStage || null,
      itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0,
    }),
  },
  controller.savePurchaseChecklistTemplate
));

router.get('/tasks', controller.getTasks);
router.post('/tasks', withAuditLog(
  {
    entity: 'OpsExecutionTask',
    action: 'CREATE',
    captureBefore: false,
    captureAfter: false,
    getNewValue: ({ req }) => ({
      title: req.body?.title || null,
      assigneeName: req.body?.assigneeName || null,
      naturalLanguageInput: req.body?.naturalLanguageInput || null,
    }),
  },
  controller.createTask
));

module.exports = router;
