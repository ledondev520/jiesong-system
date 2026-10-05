/**
 * Input: auth-session 统一入口
 * Output: 会话过期清理、提示与跳转收敛测试
 * Pos: 前端认证基础设施测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { advanceAuthGeneration } from "./browser-session";
import { getAuthToken, setAuthToken } from "./auth-token";
import {
  clearExpiredAuthSessionState,
  handleExpiredAuthSession,
  isAuthRoute,
  resetExpiredAuthSessionForTest,
} from "./auth-session";

describe("auth-session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetExpiredAuthSessionForTest();
    vi.clearAllMocks();
  });

  it("clearExpiredAuthSessionState: 清理 token 与持久化认证状态", () => {
    setAuthToken("expired-token");
    sessionStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          isAuthenticated: true,
          token: "expired-token",
          user: { id: "u1" },
        },
      }),
    );

    clearExpiredAuthSessionState();

    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem("auth-storage")).toBeNull();
  });

  it("handleExpiredAuthSession: 多次 401 只触发一次提示和一次登录跳转", () => {
    const toast = vi.fn();
    const redirect = vi.fn();
    setAuthToken("expired-token");
    sessionStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          isAuthenticated: true,
          token: "expired-token",
          user: { id: "u1" },
        },
      }),
    );

    handleExpiredAuthSession({
      pathname: "/dashboard/products",
      toastDelayMs: 0,
      redirectDelayMs: 0,
      toast,
      redirect,
    });
    handleExpiredAuthSession({
      pathname: "/dashboard/sales",
      toastDelayMs: 0,
      redirectDelayMs: 0,
      toast,
      redirect,
    });

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      "登录会话已过期，请重新登录",
      expect.objectContaining({
        id: "auth-session-expired",
        action: expect.objectContaining({ label: "去登录" }),
      }),
    );
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/login?expired=1");
    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem("auth-storage")).toBeNull();
  });

  it("新标签未持有令牌时只要求登录，不误报会话过期", () => {
    clearExpiredAuthSessionState();
    const toast = vi.fn();
    const redirect = vi.fn();
    handleExpiredAuthSession({
      pathname: "/dashboard",
      redirectDelayMs: 0,
      toast,
      redirect,
    });
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(toast).not.toHaveBeenCalled();
  });

  it("handleExpiredAuthSession: 认证页请求失败不触发会话跳转", () => {
    const toast = vi.fn();
    const redirect = vi.fn();

    handleExpiredAuthSession({
      pathname: "/login",
      toastDelayMs: 0,
      redirectDelayMs: 0,
      toast,
      redirect,
    });

    expect(toast).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("isAuthRoute: 识别认证路由", () => {
    expect(isAuthRoute("/login")).toBe(true);
    expect(isAuthRoute("/register")).toBe(true);
    expect(isAuthRoute("/forgot-password")).toBe(true);
    expect(isAuthRoute("/dashboard")).toBe(false);
  });
  it("新登录取消旧会话的延迟提示、跳转和已呈现提示动作", async () => {
    vi.useFakeTimers();
    const toast = vi.fn();
    const redirect = vi.fn();
    setAuthToken("old");
    handleExpiredAuthSession({
      pathname: "/dashboard",
      toastDelayMs: 50,
      redirectDelayMs: 100,
      toast,
      redirect,
    });
    advanceAuthGeneration();
    resetExpiredAuthSessionForTest();
    setAuthToken("new");
    await vi.advanceTimersByTimeAsync(200);
    expect(toast).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(getAuthToken()).toBe("new");
    handleExpiredAuthSession({
      pathname: "/dashboard",
      toastDelayMs: 0,
      redirectDelayMs: 100,
      toast,
      redirect,
    });
    const action = toast.mock.calls[0][1].action.onClick;
    advanceAuthGeneration();
    resetExpiredAuthSessionForTest();
    setAuthToken("newer");
    action();
    expect(redirect).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
