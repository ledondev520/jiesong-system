/**
 * 统一错误日志管理
 * 提供错误去重、采样和分级功能，避免控制台被大量重复错误淹没
 */

const MAX_ERRORS_PER_MINUTE = 10;
const ERROR_WINDOW_MS = 60 * 1000; // 1分钟

interface ErrorRecord {
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

// 内存中的错误缓存
const errorCache = new Map<string, ErrorRecord>();

/**
 * 生成错误指纹用于去重
 */
function getErrorFingerprint(error: unknown): string {
  if (error instanceof Error) {
    // 使用错误消息和堆栈的前几行作为指纹
    const stack = error.stack || '';
    const stackPreview = stack.split('\n').slice(0, 2).join('|');
    return `${error.name}:${error.message}:${stackPreview}`;
  }
  return String(error);
}

/**
 * 检查是否应该记录此错误（基于去重和速率限制）
 */
function shouldLogError(fingerprint: string): boolean {
  const now = Date.now();
  const existing = errorCache.get(fingerprint);

  if (!existing) {
    // 新错误
    errorCache.set(fingerprint, {
      message: fingerprint,
      count: 1,
      firstSeen: now,
      lastSeen: now,
    });
    return true;
  }

  // 更新现有错误
  existing.count++;
  existing.lastSeen = now;

  // 如果窗口期内错误数量超过阈值，只记录摘要
  if (existing.count > MAX_ERRORS_PER_MINUTE) {
    // 每100次报告一次
    if (existing.count % 100 === 0) {
      console.warn(`[ErrorLogger] 错误 "${fingerprint.substring(0, 50)}..." 在过去一分钟内发生了 ${existing.count} 次`);
    }
    return false;
  }

  return true;
}

/**
 * 清理过期的错误记录（每小时清理一次）
 */
function cleanupExpiredErrors(): void {
  const now = Date.now();
  for (const [key, record] of errorCache.entries()) {
    if (now - record.lastSeen > ERROR_WINDOW_MS) {
      // 如果错误发生多次，在清理前报告摘要
      if (record.count > 1) {
        console.warn(`[ErrorLogger] 清理错误记录: "${record.message.substring(0, 50)}..." 共发生 ${record.count} 次`);
      }
      errorCache.delete(key);
    }
  }
}

// 每小时清理一次
if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredErrors, ERROR_WINDOW_MS);
}

/**
 * 分级错误日志
 */
export const errorLogger = {
  /**
   * 记录错误（带去重）
   */
  error(context: string, error: unknown): void {
    const fingerprint = `${context}:${getErrorFingerprint(error)}`;

    if (!shouldLogError(fingerprint)) {
      return; // 被去重或限速
    }

    // 开发环境显示完整错误，生产环境简化
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${context}]`, error);
    } else {
      // 生产环境只记录关键信息
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${context}] ${errorMessage.substring(0, 200)}`);
    }
  },

  /**
   * 记录警告（不受去重限制，但有限流）
   */
  warn(context: string, message: string): void {
    // 警告使用简单的节流：同类型的警告每分钟最多3条
    const key = `warn:${context}:${message}`;
    const existing = errorCache.get(key);
    const now = Date.now();

    if (!existing || now - existing.lastSeen > ERROR_WINDOW_MS) {
      errorCache.set(key, { message, count: 1, firstSeen: now, lastSeen: now });
      console.warn(`[${context}] ${message}`);
    }
  },

  /**
   * 记录信息（仅开发环境）
   */
  info(context: string, message: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${context}] ${message}`);
    }
  },

  /**
   * 获取当前错误统计（用于调试）
   */
  getStats(): Record<string, ErrorRecord> {
    return Object.fromEntries(errorCache.entries());
  },

  /**
   * 清除所有错误记录
   */
  clear(): void {
    errorCache.clear();
  },
};

/**
 * 全局未捕获错误处理
 */
export function initGlobalErrorHandler(): void {
  if (typeof window === 'undefined') return;

  // 捕获未处理的Promise错误
  window.addEventListener('unhandledrejection', (event) => {
    errorLogger.error('UnhandledRejection', event.reason);
    // 阻止控制台默认输出（避免重复）
    event.preventDefault();
  });

  // 捕获全局错误
  window.addEventListener('error', (event) => {
    // 忽略资源加载错误（这些已经在network tab中可见）
    if (event.message?.includes('Script error') || event.filename) {
      errorLogger.error('ResourceError', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
      });
    } else {
      errorLogger.error('GlobalError', event.error || event.message);
    }
    // 不阻止默认输出，让调试器能看到错误
  });
}

// 初始化全局错误处理
if (typeof window !== 'undefined') {
  initGlobalErrorHandler();
}
