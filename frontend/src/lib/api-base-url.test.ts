/**
 * API Base URL 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getApiBaseUrl } from './api-base-url';

const originalEnv = process.env;

describe('api-base-url', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('应该返回 NEXT_PUBLIC_API_BASE_URL', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    delete process.env.NEXT_PUBLIC_API_URL;

    const url = getApiBaseUrl();
    expect(url).toBe('https://api.example.com');
  });

  it('应该回退到 NEXT_PUBLIC_API_URL', () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://legacy-api.example.com';

    const url = getApiBaseUrl();
    expect(url).toBe('https://legacy-api.example.com');
  });

  it('应该默认返回 /api/v1', () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    const url = getApiBaseUrl();
    expect(url).toBe('/api/v1');
  });

  it('应该优先使用 NEXT_PUBLIC_API_BASE_URL', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://new.example.com';
    process.env.NEXT_PUBLIC_API_URL = 'https://old.example.com';

    const url = getApiBaseUrl();
    expect(url).toBe('https://new.example.com');
  });
});
