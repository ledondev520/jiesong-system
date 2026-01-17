import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* API代理配置 - 将/api/v1/*请求代理到后端 */
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3000/api/v1/:path*', // 后端API地址
      },
    ];
  },
};

export default nextConfig;
