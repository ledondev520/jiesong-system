import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { getApiProxyBaseUrl } from "./src/lib/api-base-url";

/**
 * Input: 环境变量 NEXT_PUBLIC_API_BASE_URL（生产环境后端地址）
 * Output: Next.js 构建与代理配置
 * Pos: 前端构建入口配置，控制 API 代理路径与 Sentry/Vercel 集成
 */

// 开发环境默认代理到本地后端，生产环境使用环境变量
const apiBackendUrl = getApiProxyBaseUrl();

const nextConfig: NextConfig = {
  /* API代理配置 - 将/api/v1/*请求代理到后端 */
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBackendUrl}/:path*`,
      },
    ];
  },

  /*
   * 旧地址永久（308）指向合并后的页面（规格 §3.4）。Next 会把请求的查询串原样带到目标上，
   * 目标自带的参数优先；顺序即匹配顺序，具体规则必须排在 :id 之前。
   * 回归：e2e/legacy-redirects.spec.ts 逐条请求旧地址并断言 308 与 Location。
   */
  async redirects() {
    const to = (source: string, destination: string) => ({ source, destination, permanent: true });
    const query = (key: string, value: string) => ({ type: 'query' as const, key, value });
    return [
      to('/dashboard/users', '/dashboard/settings/users'),
      to('/dashboard/system', '/dashboard/settings'),
      to('/dashboard/system/logs', '/dashboard/settings/logs'),
      to('/dashboard/system/notifications', '/dashboard/notifications'),
      to('/dashboard/about', '/dashboard/settings'),
      to('/dashboard/sales/create', '/dashboard/orders/new'), // A99: old create page removed
      to('/dashboard/ai/sessions', '/dashboard/settings'),
      to('/dashboard/ai', '/dashboard?ai=1'),
      // 出口订单（旧 keyword 参数改名为 q；原 keyword 会随查询串保留，目标页忽略）
      { ...to('/dashboard/sales', '/dashboard/orders?q=:kw'), has: [query('keyword', '(?<kw>.+)')] },
      to('/dashboard/sales', '/dashboard/orders'),
      to('/dashboard/sales/:id', '/dashboard/orders/:id'),
      to('/dashboard/logistics/containers', '/dashboard/orders'),
      to('/dashboard/logistics', '/dashboard/inventory'),
      to('/dashboard/inventory-status', '/dashboard/inventory'),
      // 采购
      to('/dashboard/contracts', '/dashboard/purchases'),
      to('/dashboard/contracts/template', '/dashboard/purchases'),
      to('/dashboard/contracts/templates', '/dashboard/purchases'),
      to('/dashboard/purchase', '/dashboard/purchases'),
      to('/dashboard/purchase/create', '/dashboard/purchases/new'),
      to('/dashboard/purchase/:id', '/dashboard/purchases/:id'),
      // 财务：旧 payments 按 tab 分流，overdue 只对应收、pastDelivery 只对应付有意义
      { ...to('/dashboard/payments', '/dashboard/finance/receivable?overdue=true'), has: [query('tab', 'receivable'), query('overdue', 'true')] },
      { ...to('/dashboard/payments', '/dashboard/finance/receivable'), has: [query('tab', 'receivable')] },
      { ...to('/dashboard/payments', '/dashboard/finance/payable?pastDelivery=true'), has: [query('pastDelivery', 'true')] },
      to('/dashboard/payments', '/dashboard/finance/payable'),
      to('/dashboard/reports', '/dashboard/finance/analysis'),
      // 报关与退税
      to('/dashboard/customs-declarations', '/dashboard/customs?view=customs'),
      to('/dashboard/customs-declarations/create', '/dashboard/customs/new'),
      to('/dashboard/customs-declarations/:id/edit', '/dashboard/customs/:id/edit'),
      to('/dashboard/customs-declarations/:id', '/dashboard/customs/:id'),
      to('/dashboard/tax-refunds', '/dashboard/customs'),
      to('/customs-declarations', '/dashboard/customs?view=customs'),
      to('/customs-declarations/create', '/dashboard/customs/new'),
      to('/customs-declarations/:id/edit', '/dashboard/customs/:id/edit'),
      to('/customs-declarations/:id', '/dashboard/customs/:id'),
      to('/tax-refunds', '/dashboard/customs'),
      to('/forex-verifications', '/'),
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

  /* 仅 CI 的 E2E webServer 构建置 E2E_SKIP_BUILD_TYPECHECK=1 跳过重复类型检查；部署构建不得设置（scripts/check-build-typecheck-flag.test.cjs 守卫）。 */
  typescript: {
    ignoreBuildErrors: process.env.E2E_SKIP_BUILD_TYPECHECK === '1',
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
