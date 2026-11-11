/**
 * Input: SENTRY_DSN 环境变量
 * Output: Next.js 服务端 Sentry 错误上报初始化
 * Pos: Next.js 前端 Server Side Sentry 配置（SSR、API Routes）
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 1.0,
});
