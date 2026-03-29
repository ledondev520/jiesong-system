/**
 * Input: 所有路由模块、中间件
 * Output: Express 应用实例
 * Pos: 应用入口，初始化 Express 服务器
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const config = require('./config');
const routes = require('./routes');
const mcpRoutes = require('./routes/mcp');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { gentleRateLimit } = require('./middleware/rateLimit');
const { startInventoryAlertJob } = require('./jobs/inventoryAlertJob');
const { startAgentCredentialAlertJob } = require('./jobs/agentCredentialAlertJob');

const app = express();

const allowedOrigins = Array.isArray(config.cors.origin) ? config.cors.origin : [];
const isProduction = config.nodeEnv === 'production';

// ==================== 中间件配置 ====================

// 0. CORS 配置（生产环境强制白名单）
app.use(
  cors({
    origin: (origin, callback) => {
      // 同源 GET、健康检查、服务器间调用等场景可能没有 Origin，生产环境也必须允许。
      if (!origin) {
        return callback(null, true);
      }

      // 白名单校验
      if (allowedOrigins.length === 0) {
        // 生产环境不允许空 CORS 白名单
        if (isProduction) {
          return callback(new Error('CORS origin allowlist is empty'));
        }
        // 开发环境允许所有
        return callback(null, origin);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: config.cors.credentials,
  })
);

// 0.5. 速率限制（全局宽松限制）
app.use(gentleRateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 100, // 100 次/分钟
  message: '请求过于频繁，请稍后再试',
}));

// 1. 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 1.5. 响应压缩（排除 SSE，减少页面切换时数据传输时间）
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      const accept = String(req.headers.accept || '');
      if (accept.includes('text/event-stream') || req.path.includes('/ai/chat/stream')) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);

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

// 4. API 路由（所有业务路由挂载在/api/v1 下）
app.use('/api/v1', routes);
app.use('/mcp', mcpRoutes);

// ==================== 错误处理 ====================

// 5. 404 处理
app.use(notFoundHandler);

// 6. 统一错误处理
app.use(errorHandler);

// ==================== 启动服务器 ====================

const PORT = config.port;

if (require.main === module) {
  startInventoryAlertJob();
  startAgentCredentialAlertJob();
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
}

module.exports = app;
