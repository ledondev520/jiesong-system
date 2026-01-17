/**
 * Input: 所有业务路由模块
 * Output: 统一路由挂载点
 * Pos: 路由入口，注册所有API路由
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
const containerRoutes = require('./containers');
const inventoryRoutes = require('./inventory');
const financeRoutes = require('./finance');
const systemRoutes = require('./system');
const aiRoutes = require('./ai');
const userRoutes = require('./users');
const dataImportRoutes = require('./dataImport');
const dashboardRoutes = require('./dashboard');

const router = Router();

// ==================== 路由注册 ====================

// 认证路由（无需Token）
router.use('/auth', authRoutes);

// 业务路由（需要Token）
router.use('/suppliers', supplierRoutes);
router.use('/stores', storeRoutes);
router.use('/products', productRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/sales', salesRoutes);
router.use('/containers', containerRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/finance', financeRoutes);
router.use('/system', systemRoutes);
router.use('/ai', aiRoutes);
router.use('/users', userRoutes);
router.use('/import', dataImportRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
