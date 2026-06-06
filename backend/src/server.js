/**
 * Input: app.js 导出的 Express 应用
 * Output: 直接启动的 HTTP 服务
 * Pos: 生产环境入口（Docker / PM2 使用）
 */

const app = require('./app');
const config = require('./config');

const PORT = config.port || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 捷淞后端服务运行在 http://0.0.0.0:${PORT}`);
});
