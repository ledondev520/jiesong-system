/**
 * Input: 统一搜索控制器
 * Output: 统一搜索路由
 * Pos: 后端原生统一搜索入口，供 Agent / CLI / Web 复用
 */

const { Router } = require('express');
const searchController = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');
const { capabilityAuth } = require('../middleware/roleAuth');

const router = Router();

router.use(authenticate);

router.get('/', capabilityAuth('search.read'), searchController.search);

module.exports = router;
