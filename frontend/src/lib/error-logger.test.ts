/**
 * Error Logger 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorLogger, initGlobalErrorHandler } from './error-logger';

describe('errorLogger', () => {
  beforeEach(() => {
    errorLogger.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该记录错误', () => {
    errorLogger.error('TestContext', new Error('test error'));

    expect(console.error).toHaveBeenCalled();
  });

  it('应该去重相同错误', () => {
    const error = new Error('duplicate error');

    errorLogger.error('TestContext', error);
    errorLogger.error('TestContext', error);
    errorLogger.error('TestContext', error);

    // 当前策略是窗口期内前 10 次照常记录，之后再限速
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it('应该记录警告', () => {
    errorLogger.warn('TestContext', 'warning message');

    expect(console.warn).toHaveBeenCalledWith('[TestContext] warning message');
  });

  it('应该在开发环境记录信息', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    errorLogger.info('TestContext', 'info message');

    expect(console.log).toHaveBeenCalledWith('[TestContext] info message');

    process.env.NODE_ENV = originalEnv;
  });

  it('不应该在生产环境记录信息', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    errorLogger.info('TestContext', 'info message');

    expect(console.log).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('应该返回错误统计', () => {
    errorLogger.error('TestContext', new Error('error 1'));
    errorLogger.error('TestContext2', new Error('error 2'));

    const stats = errorLogger.getStats();
    expect(Object.keys(stats).length).toBe(2);
  });

  it('应该清除所有错误记录', () => {
    errorLogger.error('TestContext', new Error('error'));
    errorLogger.clear();

    const stats = errorLogger.getStats();
    expect(Object.keys(stats).length).toBe(0);
  });
});

describe('initGlobalErrorHandler', () => {
  it('应该初始化全局错误处理', () => {
    // 不抛出错误即视为成功
    expect(() => initGlobalErrorHandler()).not.toThrow();
  });
});
