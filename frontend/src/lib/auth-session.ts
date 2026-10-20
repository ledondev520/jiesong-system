import { clearIdempotentCache } from "@/lib/idempotentRequest";
import { clearAllCache } from "@/lib/api-cache";
import { clearApiGetCache } from "@/lib/axios";
import {
  getBrowserCsrf,
  setBrowserCsrf,
  advanceAuthGeneration,
  getAuthGeneration,
} from "@/lib/browser-session";
/**
 * Input: API 401 响应、浏览器认证持久化状态
 * Output: 区分未登录与会话失效，统一清理、单次提示与登录页跳转
 * Pos: 前端认证基础设施，收敛失效会话处理入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { clearAuthToken, getAuthToken } from "@/lib/auth-token";

const AUTH_STORAGE_KEY = "auth-storage";
const EXPIRED_LOGIN_URL = "/login?expired=1";
const EXPIRED_SESSION_TOAST_ID = "auth-session-expired";

type SessionToast = (
  message: string,
  options?: {
    id?: string;
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  },
) => void;

type ExpiredSessionOptions = {
  pathname?: string;
  toastDelayMs?: number;
  redirectDelayMs?: number;
  toast?: SessionToast;
  redirect?: (url: string) => void;
};

let expiredSessionHandled = false;
let redirectTimer: number | null = null;

const canUseBrowserStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

export const isAuthRoute = (pathname: string): boolean =>
  ["/login", "/register", "/forgot-password"].some((path) =>
    pathname.startsWith(path),
  );

export const clearExpiredAuthSessionState = (): void => {
  advanceAuthGeneration();
  clearApiGetCache();
  clearAllCache();
  clearIdempotentCache();
  clearAuthToken();
  setBrowserCsrf(null);
  if (canUseBrowserStorage()) {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }
};

const defaultRedirect = (url: string): void => {
  window.location.replace(url);
};

const showExpiredSessionToast = async (
  toast: SessionToast | undefined,
  redirect: (url: string) => void,
): Promise<void> => {
  const generation = getAuthGeneration();
  const toastFn = toast ?? (await import("sonner")).toast.error;
  if (generation !== getAuthGeneration()) return;
  toastFn("登录会话已过期，请重新登录", {
    id: EXPIRED_SESSION_TOAST_ID,
    duration: 3000,
    action: {
      label: "去登录",
      onClick: () => {
        if (generation === getAuthGeneration()) redirect(EXPIRED_LOGIN_URL);
      },
    },
  });
};

export const handleExpiredAuthSession = (
  options: ExpiredSessionOptions = {},
): void => {
  if (typeof window === "undefined") {
    return;
  }

  const pathname = options.pathname ?? window.location.pathname;
  if (isAuthRoute(pathname) || expiredSessionHandled) {
    return;
  }

  expiredSessionHandled = true;
  const hadToken = Boolean(getAuthToken() || getBrowserCsrf());
  clearExpiredAuthSessionState();
  // 新标签没有本标签令牌，401 只能证明需要登录，不能证明会话过期。
  if (!hadToken) {
    (options.redirect ?? defaultRedirect)("/login");
    return;
  }

  const toastDelayMs = options.toastDelayMs ?? 0;
  const redirectDelayMs = options.redirectDelayMs ?? 300;
  const redirect = options.redirect ?? defaultRedirect;

  const generation = getAuthGeneration();
  const showToast = () => {
    if (generation !== getAuthGeneration()) return;
    void showExpiredSessionToast(options.toast, redirect);
  };

  if (toastDelayMs <= 0) {
    showToast();
  } else {
    window.setTimeout(showToast, toastDelayMs);
  }

  const goLogin = () => {
    if (generation === getAuthGeneration()) redirect(EXPIRED_LOGIN_URL);
  };
  if (redirectDelayMs <= 0) {
    goLogin();
  } else {
    redirectTimer = window.setTimeout(goLogin, redirectDelayMs);
  }
};

export const resetExpiredAuthSession = (): void => {
  expiredSessionHandled = false;
  if (redirectTimer) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
};

export const resetExpiredAuthSessionForTest = resetExpiredAuthSession;
