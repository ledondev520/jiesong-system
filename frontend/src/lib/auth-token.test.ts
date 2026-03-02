/**
 * Input: auth-token 工具
 * Output: Token 缓存与 sessionStorage 行为测试
 * Pos: 前端认证基础设施测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuthToken, getAuthToken, setAuthToken } from './auth-token';

const AUTH_TOKEN_KEY = 'jiesong_access_token';

describe('auth-token', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAuthToken();
  });

  it('set/get: 写入后可读，并优先读取内存缓存', () => {
    setAuthToken('token-1');
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe('token-1');
    expect(getAuthToken()).toBe('token-1');

    sessionStorage.setItem(AUTH_TOKEN_KEY, 'token-2');
    expect(getAuthToken()).toBe('token-1');
  });

  it('get: 内存为空时回退读取 sessionStorage', () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'from-session');
    expect(getAuthToken()).toBe('from-session');
  });

  it('clear: 清除内存与 sessionStorage', () => {
    setAuthToken('token-x');
    clearAuthToken();

    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});
