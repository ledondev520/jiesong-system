/**
 * Input: 通知控制器
 * Output: 通知 API 路由
 * Pos: 通知路由定义
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { Router } = require('express');
const router = Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

router.use(authenticate);
router.use(roleAuth('ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'));

// GET /api/v1/notifications - 获取通知列表
router.get('/', notificationController.list);

// GET /api/v1/notifications/unread-count - 未读数量
router.get('/unread-count', notificationController.unreadCount);

// POST /api/v1/notifications/generate - 生成通知
router.post('/generate', notificationController.generate);

// POST /api/v1/notifications/read-all - 全部已读
router.post('/read-all', notificationController.markAllRead);

// POST /api/v1/notifications/:id/read - 标记已读
router.post('/:id/read', notificationController.markRead);

module.exports = router;
