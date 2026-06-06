/**
 * Input: 环境变量
 * Output: Pino 日志实例
 * Pos: 结构化日志基础设施
 */

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { pid: process.pid, service: 'jiesong-backend' },
});

module.exports = logger;
