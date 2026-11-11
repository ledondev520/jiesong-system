/**
 * Input: 合同文档控制器
 * Output: 合同文档生成路由
 * Pos: 路由层，处理合同文档生成相关请求
 */

const { Router } = require('express');
const multer = require('multer');
const contractDocController = require('../controllers/contractDocController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { withIdValidation } = require('../utils/validators');
const { withAuditLog } = require('../middleware/auditLog');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 合同文档含供应商银行信息（Restricted）：与 B60 读模型一致，SALES/WAREHOUSE 403；生成仅 DOC_ROLES，BOSS 只读。
const DOC_ROLES = ['ADMIN', 'PURCHASE', 'FINANCE'];
// OD-4：BOSS 可下载 PDF（GET /pdf 只在内存渲染，不写库不落盘）；生成 POST /generate 仍不含 BOSS。
const PDF_DOWNLOAD_ROLES = [...DOC_ROLES, 'BOSS'];

router.use(authenticate);

// GET /api/v1/contract-doc/template/check - 检查模板状态
router.get('/template/check', contractDocController.checkTemplate);

// GET /api/v1/contract-doc/templates - 获取模板列表（当前单模板）
router.get('/templates', contractDocController.getTemplates);

// POST /api/v1/contract-doc/template - 上传合同模板（仅管理员）
router.post(
  '/template',
  roleAuth('ADMIN'),
  upload.single('template'),
  withAuditLog(
    {
      entity: 'ContractTemplate',
      action: 'UPLOAD',
      captureBefore: false,
      captureAfter: false,
      getNewValue: ({ req }) => ({
        fileName: req.file?.originalname || null,
        mimeType: req.file?.mimetype || null,
        size: req.file?.size || null,
      }),
    },
    contractDocController.uploadTemplate
  )
);

// DELETE /api/v1/contract-doc/template - 删除模板（仅管理员）
router.delete('/template', roleAuth('ADMIN'), withAuditLog(
  {
    entity: 'ContractTemplate',
    action: 'DELETE',
    captureBefore: false,
    captureAfter: false,
  },
  contractDocController.deleteTemplate
));

// POST /api/v1/contract-doc/generate/:id - 根据采购合同生成购销合同
router.post(
  '/generate/:id',
  roleAuth(...DOC_ROLES),
  withIdValidation,
  withAuditLog(
    {
      entity: 'ContractFile',
      action: 'GENERATE',
      captureBefore: false,
      captureAfter: false,
      getEntityId: ({ req }) => req.params?.id || null,
      getNewValue: ({ req }) => ({
        purchaseContractId: req.params?.id || null,
        storeName: req.body?.storeName || null,
      }),
    },
    contractDocController.generateFromPurchase
  )
);

// GET /api/v1/contract-doc/pdf/:id - 获取采购合同PDF（用于预览）
router.get(
  '/pdf/:id',
  roleAuth(...PDF_DOWNLOAD_ROLES),
  withIdValidation,
  contractDocController.getContractPdf
);

module.exports = router;
