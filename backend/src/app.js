/**
 * Input: 所有路由模块、中间件
 * Output: Express应用实例
 * Pos: 应用入口，初始化Express服务器
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

const app = express();

// ==================== 中间件配置 ====================

// 0. CORS配置
app.use(cors(config.cors));

// 1. 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. 请求日志
app.use(requestLogger);

// ==================== 路由配置 ====================

// 3. 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// 4. API路由（所有业务路由挂载在/api/v1下）
app.use('/api/v1', routes);

// ==================== 错误处理 ====================

// 5. 404处理
app.use(notFoundHandler);

// 6. 统一错误处理
app.use(errorHandler);

// ==================== 启动服务器 ====================

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     捷淞进销存系统 Backend API Server      ║
╠════════════════════════════════════════════╣
║  Environment: ${config.nodeEnv.padEnd(28)}║
║  Port: ${String(PORT).padEnd(35)}║
║  URL: http://localhost:${String(PORT).padEnd(20)}║
╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
