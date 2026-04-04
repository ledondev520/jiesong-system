/**
 * 职责：API 错误处理与重试机制
 * 思路：统一处理网络错误、超时、服务端错误，提供自动重试和用户提示
 */

import { toast } from 'sonner';

export interface ApiErrorOptions {
  /** 是否显示 toast 提示 */
  showToast?: boolean;
  /** 自定义错误消息 */
  customMessage?: string;
  /** 是否允许重试 */
  allowRetry?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

export class ApiError extends Error {
  public status?: number;
  public isNetworkError: boolean;
  public isTimeout: boolean;

  constructor(message: string, status?: number, isNetworkError = false, isTimeout = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;
  }
}

/**
 * 解析 fetch 响应错误
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  let message = `请求失败 (${response.status})`;
  const isNetworkError = false;
  const isTimeout = false;

  if (response.status === 401) {
    message = '登录已过期，请重新登录';
  } else if (response.status === 403) {
    message = '没有权限执行此操作';
  } else if (response.status === 404) {
    message = '请求的资源不存在';
  } else if (response.status === 422) {
    message = '请求数据验证失败';
  } else if (response.status >= 500) {
    message = '服务器内部错误，请稍后重试';
  }

  try {
    const data = await response.json();
    if (data.message || data.error) {
      message = data.message || data.error;
    }
  } catch {
    // 忽略解析错误
  }

  return new ApiError(message, response.status, isNetworkError, isTimeout);
}

/**
 * 判断是否为网络错误
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // fetch 网络错误通常是 TypeError
    return error.message.includes('fetch') ||
           error.message.includes('network') ||
           error.message.includes('Failed to fetch');
  }
  if (error instanceof ApiError) {
    return error.isNetworkError;
  }
  return false;
}

/**
 * 执行带重试的 API 请求
 */
export async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  options: ApiErrorOptions = {}
): Promise<T> {
  const {
    showToast = true,
    customMessage,
    allowRetry = true,
    maxRetries = 3,
    retryDelay = 1000,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 判断是否应该重试
      const shouldRetry = allowRetry &&
        attempt < maxRetries &&
        isNetworkError(error);

      if (!shouldRetry) {
        break;
      }

      // 显示重试提示
      if (showToast && attempt === 0) {
        toast.warning('网络连接不稳定，正在尝试重连...', {
          duration: 3000,
        });
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
    }
  }

  // 最终错误处理
  const errorMessage = customMessage ||
    (lastError instanceof ApiError ? lastError.message : '请求失败，请检查网络连接');

  if (showToast) {
    toast.error(errorMessage, {
      action: allowRetry ? {
        label: '重试',
        onClick: () => fetchWithRetry(fetchFn, options),
      } : undefined,
    });
  }

  throw lastError || new Error(errorMessage);
}

/**
 * 包装 API 请求，统一错误处理
 */
export function createApiWrapper(baseOptions: ApiErrorOptions = {}) {
  return <T>(
    fetchFn: () => Promise<T>,
    options: ApiErrorOptions = {}
  ): Promise<T> => {
    return fetchWithRetry(fetchFn, { ...baseOptions, ...options });
  };
}
