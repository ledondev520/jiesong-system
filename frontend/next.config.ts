import type { NextConfig } from "next";

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
  turbopack: {
    /* 指定 turbopack 工作区根目录，消除多 lockfile 警告 */
    root: __dirname,
  },
};

export default nextConfig;
