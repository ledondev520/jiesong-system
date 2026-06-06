/**
 * Input: 所有业务路由模块
 * Output: 统一路由挂载点
 * Pos: 路由入口，注册所有API路由
 * 
 * 架构说明：货柜功能已合并到 sales（出口合同），每个 EXP 编号即为货柜标识
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');

// 导入各业务路由
const authRoutes = require('./auth');
const agentRoutes = require('./agents');
const supplierRoutes = require('./suppliers');
const storeRoutes = require('./stores');
const productRoutes = require('./products');
const purchaseRoutes = require('./purchases');
const salesRoutes = require('./sales');
const containerRoutes = require('./containers');
// 注意：Container 已合并到 SalesContract，不再单独使用
const inventoryRoutes = require('./inventory');
const financeRoutes = require('./finance');
const systemRoutes = require('./system');
const aiRoutes = require('./ai');
const userRoutes = require('./users');
const dataImportRoutes = require('./dataImport');
const dataExportRoutes = require('./dataExport');
const batchImportRoutes = require('./batchImport.routes');
const dashboardRoutes = require('./dashboard');
const reportsRoutes = require('./reports');
const searchRoutes = require('./search');
const contractDocRoutes = require('./contractDoc');
const storeRecommendRoutes = require('./storeRecommend');
const customsDeclarationRoutes = require('./customsDeclarations');
const forexVerificationRoutes = require('./forexVerifications');
const taxRefundRoutes = require('./taxRefunds');
const taxRateRoutes = require('./taxRates');
const hsCodeRoutes = require('./hsCodes');
const threeFormsRoutes = require('./threeForms');
const opsExecutionRoutes = require('./opsExecution');
const procurementTemplateRoutes = require('./procurementTemplate');
const bankFlowRoutes = require('./bankFlow');
const notificationRoutes = require('./notifications');
const fileRoutes = require('./files');

const router = Router();

// ==================== 路由注册 ====================

// 认证路由（无需Token）
router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);

// 业务路由（需要Token）
router.use('/suppliers', supplierRoutes);
router.use('/stores', storeRoutes);
router.use('/products', productRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/sales', salesRoutes); // 出口合同管理（含货柜/装箱功能）
router.use('/containers', containerRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/finance', financeRoutes);
router.use('/system', systemRoutes);
router.use('/ai', aiRoutes);
router.use('/users', userRoutes);
router.use('/import', dataImportRoutes);
router.use('/export', dataExportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportsRoutes);
router.use('/search', searchRoutes);
router.use('/contract-doc', contractDocRoutes);  // 合同文档生成
router.use('/store-recommend', storeRecommendRoutes);  // 门店采购建议
router.use('/customs-declarations', customsDeclarationRoutes);
router.use('/forex-verifications', forexVerificationRoutes);
router.use('/tax-refunds', taxRefundRoutes);
router.use('/tax-rates', taxRateRoutes);
router.use('/hs-codes', hsCodeRoutes);
router.use('/three-forms', threeFormsRoutes);
router.use('/ops-execution', opsExecutionRoutes);
router.use('/procurement-template', procurementTemplateRoutes);  // 开业采购模板（CSV分析）
router.use('/batch-import', batchImportRoutes);  // 批量导入
router.use('/bank-flow', bankFlowRoutes);  // 银行流水与发票查询
router.use('/notifications', notificationRoutes);  // 站内通知
router.use('/', fileRoutes);  // 合同附件（/contracts/:id/files, /files/:id/download）

module.exports = router;
