/**
 * Input: NEXT_PUBLIC_SENTRY_DSN 环境变量
 * Output: Next.js Edge Runtime Sentry 初始化
 * Pos: Next.js Edge 运行时 Sentry 配置（Middleware 等）
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 1.0,
});
