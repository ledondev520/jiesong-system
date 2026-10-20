/**
 * Input: 前端 API 基址环境变量
 * Output: 普通请求与 Next 代理一致的 API 基址（兼容后端地址和完整 /api/v1 地址）
 * Pos: 前端 HTTP/流式请求共享入口
 *
 * Note: 兼容历史 `NEXT_PUBLIC_API_URL`，规范使用 `NEXT_PUBLIC_API_BASE_URL`。
 */

const configuredUrl = (): string =>
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  '/api/v1';

const normalize = (value: string): string => {
  const base = value.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/?#]+$/i.test(base) ? `${base}/api/v1` : base;
};

export const getApiBaseUrl = (): string => normalize(configuredUrl());

// 相对基址交由同源代理处理；保持原有 localhost:3001 后端默认值。
export const getApiProxyBaseUrl = (): string => {
  const value = configuredUrl().trim();
  return normalize(/^https?:\/\//i.test(value) ? value : 'http://localhost:3001');
};
