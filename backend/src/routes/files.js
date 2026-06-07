/**
 * Input: fileController、认证中间件、上传中间件
 * Output: 统一合同附件路由
 * Pos: 合同附件管理路由，挂载在 /api/v1 下
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const fileController = require('../controllers/fileController');
const { authenticate, roleAuth } = require('../middleware/auth');
const { contractUpload } = require('../utils/upload');
const { withAuditLog } = require('../middleware/auditLog');
const { param, handleValidation } = require('../utils/validators');

const router = Router();
const WRITE_ROLES = ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'];
const withContractIdValidation = [
  param('contractId').notEmpty().withMessage('合同ID不能为空').isString().withMessage('合同ID格式无效'),
  handleValidation,
];

router.use(authenticate);

// POST /api/v1/contracts/:contractId/files — 上传附件
router.post(
  '/contracts/:contractId/files',
  withContractIdValidation,
  roleAuth(...WRITE_ROLES),
  contractUpload.single('file'),
  withAuditLog(
    { entity: 'ContractFile', action: 'CREATE', model: 'contractFile' },
    fileController.uploadFile
  )
);

// GET /api/v1/contracts/:contractId/files — 列出附件
router.get(
  '/contracts/:contractId/files',
  withContractIdValidation,
  fileController.listFiles
);

// GET /api/v1/files/:fileId/download — 下载附件
router.get('/files/:fileId/download', fileController.downloadFile);

// DELETE /api/v1/files/:fileId — 删除附件
router.delete(
  '/files/:fileId',
  roleAuth(...WRITE_ROLES),
  withAuditLog(
    { entity: 'ContractFile', action: 'DELETE', model: 'contractFile' },
    fileController.deleteFile
  )
);

module.exports = router;
