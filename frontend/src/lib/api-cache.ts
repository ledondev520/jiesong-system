/**
 * Input: API 请求 key + 数据获取函数
 * Output: 按认证代次隔离的内存缓存请求结果
 * Pos: 轻量级前端请求缓存层，用于减少 Tab 切换时重复发起相同请求
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { getAuthGeneration } from "@/lib/browser-session";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// 全局内存 Map，生命周期与浏览器标签一致
let cacheGeneration = 0;
const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 30_000; // 30 秒
const MAX_CACHE_SIZE = 200; // 最大条目数，防止无界增长
const GC_INTERVAL_MS = 5 * 60_000; // 每 5 分钟清理一次过期条目

// 定期扫描并删除过期条目，防止长期运行时内存泄漏
if (typeof window !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }, GC_INTERVAL_MS);
}

/**
 * 职责：从缓存中取数据，命中则直接返回，未命中则调用 fetcher 并写入缓存
 * 思路：
 *   1. 检查 key 是否在 Map 中且未过期
 *   2. 命中：直接返回缓存值
 *   3. 未命中：调用 fetcher，写入 Map（带过期时间）
 * @param key   唯一缓存键（建议用请求 URL + 参数拼接）
 * @param fetcher 实际数据获取函数（返回 Promise<T>）
 * @param ttl   缓存有效期（毫秒），默认 30 秒
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL_MS,
): Promise<T> {
  const generation = getAuthGeneration();
  const cacheVersion = cacheGeneration;
  const cacheKey = `${generation}|${key}`;
  const now = Date.now();
  const entry = cache.get(cacheKey) as CacheEntry<T> | undefined;

  // 1. 缓存命中且未过期
  if (entry && entry.expiresAt > now) {
    return entry.data;
  }

  // 2. 未命中：发请求并写缓存
  const data = await fetcher();

  // 2.1. 若超过最大条目数，驱逐最早过期的条目（简单 LRU-by-expiry）
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestExpiry = Infinity;
    for (const [k, e] of cache.entries()) {
      if (e.expiresAt < oldestExpiry) {
        oldestExpiry = e.expiresAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  if (generation === getAuthGeneration() && cacheVersion === cacheGeneration)
    cache.set(cacheKey, { data, expiresAt: now + ttl });
  return data;
}

/**
 * 职责：主动失效某个 key 或前缀匹配的所有 key
 * @param keyOrPrefix 精确 key 或以此开头的 key 前缀
 */
export function invalidateCache(keyOrPrefix: string): void {
  const prefix = `${getAuthGeneration()}|${keyOrPrefix}`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * 职责：清空整个缓存（用于登出或数据全局刷新）
 */
export function clearAllCache(): void {
  cacheGeneration += 1;
  cache.clear();
}
