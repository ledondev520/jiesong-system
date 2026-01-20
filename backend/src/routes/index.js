/**
 * Input: 所有业务路由模块
 * Output: 统一路由挂载点
 * Pos: 路由入口，注册所有API路由
 * 
 * 2026-01-20 重构：移除 containers 路由，功能已合并到 sales
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');

// 导入各业务路由
const authRoutes = require('./auth');
const supplierRoutes = require('./suppliers');
const storeRoutes = require('./stores');
const productRoutes = require('./products');
const purchaseRoutes = require('./purchases');
const salesRoutes = require('./sales');
// const containerRoutes = require('./containers'); // 已废弃，功能合并到 sales
const inventoryRoutes = require('./inventory');
const financeRoutes = require('./finance');
const systemRoutes = require('./system');
const aiRoutes = require('./ai');
const userRoutes = require('./users');
const dataImportRoutes = require('./dataImport');
const dashboardRoutes = require('./dashboard');
const contractDocRoutes = require('./contractDoc');

const router = Router();

// ==================== 路由注册 ====================

// 认证路由（无需Token）
router.use('/auth', authRoutes);

// 业务路由（需要Token）
router.use('/suppliers', supplierRoutes);
router.use('/stores', storeRoutes);
router.use('/products', productRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/sales', salesRoutes);       // 出口合同管理（含装箱功能）
// router.use('/containers', containerRoutes); // 已废弃
router.use('/inventory', inventoryRoutes);
router.use('/finance', financeRoutes);
router.use('/system', systemRoutes);
router.use('/ai', aiRoutes);
router.use('/users', userRoutes);
router.use('/import', dataImportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/contract-doc', contractDocRoutes);  // 合同文档生成

module.exports = router;
