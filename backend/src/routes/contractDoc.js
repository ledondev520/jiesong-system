/**
 * Input: 合同文档控制器
 * Output: 合同文档生成路由
 * Pos: 路由层，处理合同文档生成相关请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const multer = require('multer');
const contractDocController = require('../controllers/contractDocController');
const { authenticate, adminOnly } = require('../middleware/auth');
const { validateId, handleValidation } = require('../utils/validators');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

// GET /api/v1/contract-doc/template/check - 检查模板状态
router.get('/template/check', contractDocController.checkTemplate);

// GET /api/v1/contract-doc/templates - 获取模板列表（当前单模板）
router.get('/templates', contractDocController.getTemplates);

// POST /api/v1/contract-doc/template - 上传合同模板（仅管理员）
router.post(
  '/template',
  adminOnly,
  upload.single('template'),
  contractDocController.uploadTemplate
);

// DELETE /api/v1/contract-doc/template - 删除模板（仅管理员）
router.delete('/template', adminOnly, contractDocController.deleteTemplate);

// POST /api/v1/contract-doc/generate/:id - 根据采购合同生成购销合同
router.post(
  '/generate/:id',
  validateId,
  handleValidation,
  contractDocController.generateFromPurchase
);

// GET /api/v1/contract-doc/pdf/:id - 获取采购合同PDF（用于预览）
router.get(
  '/pdf/:id',
  validateId,
  handleValidation,
  contractDocController.getContractPdf
);

module.exports = router;
