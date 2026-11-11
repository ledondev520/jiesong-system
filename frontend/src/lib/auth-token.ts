/**
 * Input: 浏览器 sessionStorage
 * Output: 认证 Token 读写工具
 * Pos: 前端认证基础设施，统一管理访问令牌
 */

const AUTH_TOKEN_KEY = "jiesong_access_token";

let memoryToken: string | null = null;

const canUseSessionStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

export const getAuthToken = (): string | null => {
  if (memoryToken) {
    return memoryToken;
  }
  if (!canUseSessionStorage()) {
    return null;
  }

  const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  memoryToken = token;
  return token;
};

export const setAuthToken = (token: string): void => {
  memoryToken = token;
  if (canUseSessionStorage()) {
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  }
};

export const clearAuthToken = (): void => {
  memoryToken = null;
  if (canUseSessionStorage()) {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }
};
