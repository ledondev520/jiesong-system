/** Bearer/cookie transport with CSRF, generation-safe expiry handling and identity-isolated GET caches. */
import {
  getBrowserSessionHeaders,
  getAuthGeneration,
} from "@/lib/browser-session";
import axios, { type AxiosRequestConfig } from "axios";
import { getAuthToken } from "@/lib/auth-token";
import { handleExpiredAuthSession } from "@/lib/auth-session";
import { getApiBaseUrl } from "@/lib/api-base-url";

// Create Axios instance
// 使用相对路径，通过Next.js rewrites代理到后端
const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  timeout: 60000, // 增加到60秒，AI调用可能需要更长时间
  headers: {
    "Content-Type": "application/json",
  },
});

export type ApiRequestConfig<D = unknown> = AxiosRequestConfig<D> & {
  skipAuthRedirect?: boolean;
  skipBearer?: boolean;
  authGeneration?: number;
  cache?: {
    enabled?: boolean;
    ttlMs?: number;
  };
};

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const DEFAULT_GET_CACHE_TTL_MS = 180_000;
const MAX_GET_CACHE_ENTRIES = 200;

let cacheGeneration = 0;
const getResponseCache = new Map<string, CacheEntry>();
const inFlightGetRequests = new Map<string, Promise<unknown>>();

const normalizeCacheValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return `[${value.map((item) => normalizeCacheValue(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${normalizeCacheValue(record[key])}`)
      .join(",")}}`;
  }
  return String(value);
};

const buildGetCacheKey = (url: string, config?: ApiRequestConfig) => {
  const baseURL = config?.baseURL ?? api.defaults.baseURL ?? "";
  const paramsSignature = normalizeCacheValue(config?.params);
  return `${baseURL}|${url}|${paramsSignature}`;
};

const cleanupExpiredGetCache = (now = Date.now()) => {
  for (const [key, value] of getResponseCache.entries()) {
    if (value.expiresAt <= now) {
      getResponseCache.delete(key);
    }
  }
};

const enforceGetCacheSizeLimit = () => {
  while (getResponseCache.size > MAX_GET_CACHE_ENTRIES) {
    const oldestKey = getResponseCache.keys().next().value;
    if (!oldestKey) break;
    getResponseCache.delete(oldestKey);
  }
};

const shouldUseGetCache = (config?: ApiRequestConfig) => {
  if (!config?.cache) return true;
  return config.cache.enabled !== false;
};

const resolveGetCacheTtlMs = (config?: ApiRequestConfig) => {
  const customTtl = config?.cache?.ttlMs;
  if (typeof customTtl === "number" && Number.isFinite(customTtl)) {
    return Math.max(0, customTtl);
  }
  return DEFAULT_GET_CACHE_TTL_MS;
};

const clearGetCache = () => {
  cacheGeneration += 1;
  getResponseCache.clear();
  inFlightGetRequests.clear();
};

const cloneCachedData = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  // 兜底用于测试环境，确保缓存对象不会被页面层意外修改。
  return JSON.parse(JSON.stringify(value)) as T;
};

const rawGet: typeof api.get = api.get.bind(api);
const rawPost: typeof api.post = api.post.bind(api);
const rawPut: typeof api.put = api.put.bind(api);
const rawPatch: typeof api.patch = api.patch.bind(api);
const rawDelete: typeof api.delete = api.delete.bind(api);

const cachedGet: typeof api.get = async <T = unknown, R = T, D = unknown>(
  url: string,
  config?: AxiosRequestConfig<D>,
): Promise<R> => {
  const requestConfig = config as ApiRequestConfig<D> | undefined;
  if (!shouldUseGetCache(requestConfig)) {
    return rawGet<T, R, D>(url, config);
  }

  cleanupExpiredGetCache();
  const generation = cacheGeneration;
  const cacheKey = `${generation}|${buildGetCacheKey(url, requestConfig)}`;
  const now = Date.now();
  const cached = getResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cloneCachedData(cached.data as R);
  }

  const inFlight = inFlightGetRequests.get(cacheKey);
  if (inFlight) {
    return cloneCachedData((await inFlight) as R);
  }

  const requestPromise: Promise<R> = (async () => {
    const response = await rawGet<T, R, D>(url, config);
    const ttlMs = resolveGetCacheTtlMs(requestConfig);
    if (ttlMs > 0 && generation === cacheGeneration) {
      getResponseCache.set(cacheKey, {
        data: response,
        expiresAt: Date.now() + ttlMs,
      });
      enforceGetCacheSizeLimit();
    }
    return response;
  })();

  inFlightGetRequests.set(cacheKey, requestPromise as Promise<unknown>);
  try {
    return cloneCachedData(await requestPromise);
  } finally {
    if (generation === cacheGeneration) inFlightGetRequests.delete(cacheKey);
  }
};
api.get = cachedGet;

const wrapMutationMethod = <TArgs extends unknown[], TResult>(
  method: (...args: TArgs) => Promise<TResult>,
) => {
  return async (...args: TArgs): Promise<TResult> => {
    const result = await method(...args);
    clearGetCache();
    return result;
  };
};

api.post = wrapMutationMethod(rawPost) as typeof api.post;
api.put = wrapMutationMethod(rawPut) as typeof api.put;
api.patch = wrapMutationMethod(rawPatch) as typeof api.patch;
api.delete = wrapMutationMethod(rawDelete) as typeof api.delete;

// Request interceptor
api.interceptors.request.use(
  (config) => {
    (config as ApiRequestConfig).authGeneration = getAuthGeneration();
    // Client-side only
    if (typeof window !== "undefined") {
      const explicitCsrf = Object.keys(config.headers).some(
        (key) => key.toLowerCase() === "x-csrf-token",
      );
      if (!explicitCsrf)
        Object.assign(config.headers, getBrowserSessionHeaders());
      const token = getAuthToken();
      if ((config as ApiRequestConfig).skipBearer) {
        delete config.headers.Authorization;
      } else if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data; // Directly return data
  },
  (error) => {
    if (error.response) {
      if (
        error.response.status === 401 &&
        !error.config?.skipAuthRedirect &&
        error.config?.authGeneration === getAuthGeneration()
      ) {
        handleExpiredAuthSession();
      }
      return Promise.reject(error.response.data);
    }
    // 无响应（超时/断网）时 axios 的 message 是英文，统一转成中文提示
    const isTimeout =
      error.code === "ECONNABORTED" ||
      /timeout/i.test(String(error.message || ""));
    const friendly = new Error(
      isTimeout ? "请求超时，请稍后重试" : "网络连接失败，请检查网络后重试",
    );
    friendly.name = error.name || "NetworkError";
    return Promise.reject(friendly);
  },
);

export const clearApiGetCache = clearGetCache;
export default api;
