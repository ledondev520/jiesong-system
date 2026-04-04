/**
 * 前端性能监控
 * 收集和上报 Core Web Vitals 及其他性能指标
 */

import { useEffect, useState, useCallback, useRef } from 'react';

// 性能指标类型
export interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
  inp?: number; // Interaction to Next Paint

  // 自定义指标
  pageLoadTime?: number;
  domReadyTime?: number;
  resourceCount?: number;
  apiLatency?: Record<string, number>;
}

// 性能监控配置
interface PerformanceMonitorConfig {
  // 是否启用监控
  enabled?: boolean;
  // 采样率 (0-1)
  sampleRate?: number;
  // 上报 URL
  endpoint?: string;
  // 是否在控制台输出
  debug?: boolean;
  // 慢请求阈值 (ms)
  slowRequestThreshold?: number;
  // 慢渲染阈值 (ms)
  slowRenderThreshold?: number;
}

// 默认配置
const defaultConfig: Required<PerformanceMonitorConfig> = {
  enabled: true,
  sampleRate: 1.0,
  endpoint: '/api/metrics/performance',
  debug: process.env.NODE_ENV === 'development',
  slowRequestThreshold: 1000,
  slowRenderThreshold: 100,
};

let config: Required<PerformanceMonitorConfig> = { ...defaultConfig };

/**
 * 初始化性能监控配置
 */
export function initPerformanceMonitor(userConfig?: PerformanceMonitorConfig): void {
  config = { ...defaultConfig, ...userConfig };

  if (!config.enabled) return;

  // 检查采样率
  if (Math.random() > config.sampleRate) {
    config.enabled = false;
    return;
  }

  // 收集 Web Vitals
  observeWebVitals();

  // 监听资源加载
  observeResourceLoading();

  // 监听 API 请求
  observeFetch();

  // 监听页面卸载时上报
  window.addEventListener('beforeunload', () => {
    reportMetrics();
  });
}

// 存储性能指标
const metrics: PerformanceMetrics = {};

/**
 * 观察 Core Web Vitals
 */
function observeWebVitals(): void {
  // LCP (Largest Contentful Paint)
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
        metrics.lcp = lastEntry.startTime;

        if (config.debug) {
          console.log('[Performance] LCP:', metrics.lcp);
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch {
      // 浏览器不支持
    }
  }

  // FID (First Input Delay) - 使用 INP 替代
  if ('PerformanceObserver' in window) {
    try {
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[];

        entries.forEach((entry) => {
          const delay = entry.processingStart - entry.startTime;
          if (!metrics.inp || delay > metrics.inp) {
            metrics.inp = delay;
          }
        });

        if (config.debug) {
          console.log('[Performance] INP:', metrics.inp);
        }
      });
      inpObserver.observe({ entryTypes: ['event'] });
    } catch {
      // 浏览器不支持
    }
  }

  // CLS (Cumulative Layout Shift)
  if ('PerformanceObserver' in window) {
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShiftEntry = entry as { hadRecentInput?: boolean; value?: number };
          if (!layoutShiftEntry.hadRecentInput) {
            clsValue += layoutShiftEntry.value ?? 0;
          }
        }
        metrics.cls = clsValue;

        if (config.debug) {
          console.log('[Performance] CLS:', metrics.cls);
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch {
      // 浏览器不支持
    }
  }

  // FCP (First Contentful Paint)
  if ('PerformanceObserver' in window) {
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcpEntry = entries[0] as PerformanceEntry & { startTime: number };
        metrics.fcp = fcpEntry.startTime;

        if (config.debug) {
          console.log('[Performance] FCP:', metrics.fcp);
        }
      });
      fcpObserver.observe({ entryTypes: ['paint'] });
    } catch {
      // 浏览器不支持
    }
  }

  // TTFB (Time to First Byte)
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  if (navigation) {
    metrics.ttfb = navigation.responseStart - navigation.startTime;

    if (config.debug) {
      console.log('[Performance] TTFB:', metrics.ttfb);
    }
  }

  // 页面加载时间
  window.addEventListener('load', () => {
    setTimeout(() => {
      const timing = performance.timing;
      metrics.pageLoadTime = timing.loadEventEnd - timing.navigationStart;
      metrics.domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;

      if (config.debug) {
        console.log('[Performance] Page Load Time:', metrics.pageLoadTime);
        console.log('[Performance] DOM Ready Time:', metrics.domReadyTime);
      }
    }, 0);
  });
}

/**
 * 监听资源加载
 */
function observeResourceLoading(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    const resourceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      metrics.resourceCount = (metrics.resourceCount || 0) + entries.length;

      // 检查慢资源
      entries.forEach((entry) => {
        const resource = entry as PerformanceResourceTiming;
        const duration = resource.duration;

        if (duration > config.slowRequestThreshold && config.debug) {
          console.warn('[Performance] Slow resource:', resource.name, `${duration}ms`);
        }
      });
    });

    resourceObserver.observe({ entryTypes: ['resource'] });
  } catch {
    // 浏览器不支持
  }
}

/**
 * 监听 fetch 请求
 */
function observeFetch(): void {
  const originalFetch = window.fetch;
  metrics.apiLatency = {};

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const startTime = performance.now();
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url, window.location.origin).pathname;

    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;

      // 记录 API 延迟
      if (!metrics.apiLatency) {
        metrics.apiLatency = {};
      }
      metrics.apiLatency[path] = duration;

      // 检查慢请求
      if (duration > config.slowRequestThreshold && config.debug) {
        console.warn('[Performance] Slow API request:', path, `${duration.toFixed(2)}ms`);
      }

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      if (!metrics.apiLatency) {
        metrics.apiLatency = {};
      }
      metrics.apiLatency[path] = duration;
      throw error;
    }
  };
}

/**
 * 上报性能指标
 */
function reportMetrics(): void {
  if (!config.enabled) return;

  // 过滤掉 undefined 的值
  const cleanMetrics = Object.entries(metrics).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, unknown>);

  if (Object.keys(cleanMetrics).length === 0) return;

  const payload = {
    metrics: cleanMetrics,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
  };

  // 使用 sendBeacon 上报（页面卸载时也能发送）
  if (navigator.sendBeacon) {
    navigator.sendBeacon(config.endpoint, JSON.stringify(payload));
  } else {
    // 降级方案
    fetch(config.endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {
      // 上报失败时忽略
    });
  }
}

/**
 * React Hook: 使用性能监控
 */
export function usePerformanceMonitor(componentName?: string) {
  const [renderTime, setRenderTime] = useState<number>();
  const renderStartRef = useRef<number>(0);

  useEffect(() => {
    renderStartRef.current = performance.now();
  }, []);

  useEffect(() => {
    const duration = performance.now() - renderStartRef.current;
    setRenderTime(duration);

    if (componentName && config.debug) {
      console.log(`[Performance] ${componentName} rendered in ${duration.toFixed(2)}ms`);
    }

    // 检查慢渲染
    if (duration > config.slowRenderThreshold && config.debug) {
      console.warn(`[Performance] Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
    }
  }, [componentName]);

  const measureAsync = useCallback(
    async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      try {
        const result = await fn();
        const duration = performance.now() - start;

        if (config.debug) {
          console.log(`[Performance] ${name} completed in ${duration.toFixed(2)}ms`);
        }

        return result;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`[Performance] ${name} failed after ${duration.toFixed(2)}ms`);
        throw error;
      }
    },
    []
  );

  return {
    renderTime,
    metrics,
    measureAsync,
  };
}

/**
 * 获取当前性能指标
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * 手动上报性能指标
 */
export function reportCustomMetric(name: string, value: number): void {
  if (!config.enabled) return;

  if (config.debug) {
    console.log('[Performance] Custom metric:', name, value);
  }

  // 这里可以发送到服务器
  const payload = {
    name,
    value,
    timestamp: Date.now(),
    url: window.location.href,
  };

  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${config.endpoint}/custom`, JSON.stringify(payload));
  }
}
