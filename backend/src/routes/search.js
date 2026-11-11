/**
 * Input: 统一搜索控制器
 * Output: 统一搜索路由
 * Pos: 后端原生统一搜索入口，供 Web 使用
 */

const { Router } = require('express');
const searchController = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', searchController.search);

module.exports = router;
