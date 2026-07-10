import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

/**
 * Input: 环境变量 NEXT_PUBLIC_API_BASE_URL（生产环境后端地址）
 * Output: Next.js 构建与代理配置
 * Pos: 前端构建入口配置，控制 API 代理路径与 Sentry/Vercel 集成
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 开发环境默认代理到本地后端，生产环境使用环境变量
const apiBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  /* API代理配置 - 将/api/v1/*请求代理到后端 */
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBackendUrl}/api/v1/:path*`,
      },
    ];
  },

  /* 图片优化：自动 WebP/AVIF 转换、缓存、尺寸限制 */
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 天
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  /* 静态资源压缩（Next.js 16 默认 SWC 压缩，显式确认） */
  compress: true,

  /* 实验性优化：大型库按需加载 */
  experimental: {
    optimizePackageImports: [
      'recharts',
      'lucide-react',
      'date-fns',
      '@radix-ui/react-icons',
    ],
  },

  /* HTTP 头配置 - 缓存与安全策略 */
  async headers() {
    // _next/static 使用 Next.js 内置的环境感知策略；开发块若强制 immutable 会导致新旧渲染代码混用。
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/api/v1/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/login',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/register',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/forgot-password',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },

  turbopack: {
    /* 指定 turbopack 工作区根目录，消除多 lockfile 警告 */
    root: __dirname,
  },
};

/* Bundle 分析：仅在 ANALYZE=true 时启用 */
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withAnalyzer(nextConfig);
