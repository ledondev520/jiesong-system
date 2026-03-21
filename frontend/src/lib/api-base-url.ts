/**
 * Input: 前端 API 基址环境变量
 * Output: 统一的 API 基址解析结果
 * Pos: 前端 HTTP/流式请求共享入口
 *
 * Note: 兼容历史 `NEXT_PUBLIC_API_URL`，规范使用 `NEXT_PUBLIC_API_BASE_URL`。
 */

export const getApiBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  '/api/v1';
