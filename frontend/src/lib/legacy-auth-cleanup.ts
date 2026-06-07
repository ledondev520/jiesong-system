/**
 * Input: 浏览器 localStorage
 * Output: 清理旧快捷登录资料后的认证页本地状态
 * Pos: 前端认证基础设施，隔离旧快捷登录缓存清理逻辑
 *
 * Security: 旧快捷登录曾保存过密码；认证页只清理这些本地资料，不再把它们作为登录凭据
 */

const KNOWN_LEGACY_QUICK_LOGIN_KEYS = [
  'jiesong_quick_login_profile',
  'jiesong_login_profile',
  'quick_login_profile',
  'quickLoginProfile',
  'remembered_login_profile',
  'rememberedLoginProfile',
];

const LEGACY_QUICK_LOGIN_KEY_PATTERNS = [
  /quick[_-]?login/i,
  /quickLogin/,
  /remembered[_-]?login/i,
  /rememberedLogin/,
  /saved[_-]?login[_-]?profile/i,
  /savedLoginProfile/,
];

export const LEGACY_AUTH_CLEANUP_VERSION_KEY = 'jiesong_auth_cleanup_version';
export const LEGACY_AUTH_CLEANUP_VERSION = '2026-06-07-no-quick-login';

const canUseLocalStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isLegacyQuickLoginKey = (key: string): boolean =>
  KNOWN_LEGACY_QUICK_LOGIN_KEYS.includes(key) ||
  LEGACY_QUICK_LOGIN_KEY_PATTERNS.some((pattern) => pattern.test(key));

export function clearLegacyQuickLoginState(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  for (const key of KNOWN_LEGACY_QUICK_LOGIN_KEYS) {
    window.localStorage.removeItem(key);
  }

  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => Boolean(key));

  for (const key of keys) {
    if (isLegacyQuickLoginKey(key)) {
      window.localStorage.removeItem(key);
    }
  }

  window.localStorage.setItem(LEGACY_AUTH_CLEANUP_VERSION_KEY, LEGACY_AUTH_CLEANUP_VERSION);
}
