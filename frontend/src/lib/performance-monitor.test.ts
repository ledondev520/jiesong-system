/**
 * Performance Monitor 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initPerformanceMonitor,
  getPerformanceMetrics,
  reportCustomMetric,
} from './performance-monitor';

describe('Performance Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock PerformanceObserver
    global.PerformanceObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(),
    })) as unknown as typeof PerformanceObserver;

    // Mock performance
    Object.defineProperty(global, 'performance', {
      value: {
        now: vi.fn(() => 1000),
        timing: {
          loadEventEnd: 2000,
          navigationStart: 0,
          domContentLoadedEventEnd: 1500,
        },
        getEntriesByType: vi.fn(() => [{
          responseStart: 100,
          startTime: 0,
        }]),
      },
      writable: true,
    });

    // Mock navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        sendBeacon: vi.fn(),
        userAgent: 'test-agent',
      },
      writable: true,
    });
  });

  describe('initPerformanceMonitor', () => {
    it('应该初始化监控器', () => {
      initPerformanceMonitor({ enabled: true, debug: false });
      expect(global.PerformanceObserver).toHaveBeenCalled();
    });

    it('禁用时应该不初始化', () => {
      initPerformanceMonitor({ enabled: false });
      // 禁用时不会创建 Observer
      expect(global.PerformanceObserver).not.toHaveBeenCalled();
    });

    it('应该根据采样率决定是否启用', () => {
      // 固定随机数使得测试可预测
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

      initPerformanceMonitor({ enabled: true, sampleRate: 0.5 });

      // 随机数 0.9 > 采样率 0.5，应该禁用
      expect(global.PerformanceObserver).not.toHaveBeenCalled();

      randomSpy.mockRestore();
    });
  });

  describe('getPerformanceMetrics', () => {
    it('应该返回当前指标', () => {
      initPerformanceMonitor({ enabled: true });
      const metrics = getPerformanceMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });
  });

  describe('reportCustomMetric', () => {
    it('应该上报自定义指标', () => {
      initPerformanceMonitor({ enabled: true });
      reportCustomMetric('test-metric', 100);

      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        '/api/metrics/performance/custom',
        expect.any(String)
      );
    });

    it('禁用时应该不上报', () => {
      initPerformanceMonitor({ enabled: false });
      reportCustomMetric('test-metric', 100);

      expect(navigator.sendBeacon).not.toHaveBeenCalled();
    });
  });

  describe('fetch monitoring', () => {
    it('应该拦截 fetch 请求', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      initPerformanceMonitor({ enabled: true, debug: false });

      await fetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith('/api/test', undefined);
    });
  });
});
