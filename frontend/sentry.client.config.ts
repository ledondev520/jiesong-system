/**
 * Input: NEXT_PUBLIC_SENTRY_DSN 环境变量
 * Output: 浏览器端 Sentry 错误上报初始化
 * Pos: Next.js 前端客户端 Sentry 配置（浏览器运行时）
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  // DSN 从 Sentry 项目 Settings → Client Keys 获取
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 生产环境开启，开发环境关闭
  enabled: process.env.NODE_ENV === 'production',

  // 采样率：1.0 = 100% 错误全量上报
  tracesSampleRate: 1.0,
});
