/**
 * Auth Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { authService } from "./auth.service";
import { advanceAuthGeneration } from "@/lib/browser-session";
import api from "@/lib/axios";

vi.mock("@/lib/axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该登录成功", async () => {
    const mockResponse = {
      code: 200,
      data: {
        user: { id: "1", username: "admin", name: "Admin" },
        token: "jwt-token",
      },
      message: "登录成功",
    };

    vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

    const result = await authService.login({
      username: "admin",
      password: "123456",
    });

    expect(api.post).toHaveBeenCalledWith(
      "/auth/login",
      {
        username: "admin",
        password: "123456",
      },
      undefined,
    );
    expect(result.data).toEqual(mockResponse);
  });

  it("应该重置密码", async () => {
    const mockResponse = { code: 200, data: null, message: "重置成功" };
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

    const result = await authService.resetPassword({
      email: "recovery@example.com",
      code: "123456",
      newPassword: "test-only-new-password",
    });

    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
      email: "recovery@example.com",
      code: "123456",
      newPassword: "test-only-new-password",
    });
    expect(result.data).toEqual(mockResponse);
  });
  it("恢复绕过缓存和全局失效跳转，并传递取消信号", async () => {
    const signal = new AbortController().signal;
    vi.mocked(api.get).mockResolvedValue({ code: 200 });
    await authService.restoreSession(signal);
    expect(api.get).toHaveBeenCalledWith("/auth/session", {
      signal,
      timeout: 10000,
      cache: { enabled: false },
      skipAuthRedirect: true,
    });
  });
  it("重复退出共用同一个待完成请求", async () => {
    let done!: (value: unknown) => void;
    vi.mocked(api.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    vi.mocked(api.get).mockResolvedValue({
      code: 200,
      data: { csrfToken: "fresh-cookie-proof" },
    });
    const first = authService.logout(),
      second = authService.logout();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      "/auth/logout",
      undefined,
      expect.objectContaining({
        skipBearer: true,
        headers: { "X-CSRF-Token": "fresh-cookie-proof" },
      }),
    );
    done({ code: 200 });
    await first;
  });
  it("退出证明请求晚到时不撤销较新的登录", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = authService.logout();
    advanceAuthGeneration();
    finish({ code: 200, data: { csrfToken: "newer-cookie-proof" } });
    await expect(pending).rejects.toThrow("登录状态已变化");
    expect(api.post).not.toHaveBeenCalled();
  });
  it("新会话的退出不复用旧会话请求，旧finally不能清除新请求", async () => {
    let oldDone!: (value: unknown) => void, newDone!: (value: unknown) => void;
    vi.mocked(api.get)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldDone = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            newDone = resolve;
          }),
      );
    vi.mocked(api.post).mockResolvedValue({ code: 200 });
    const old = authService.logout();
    const oldRejected = expect(old).rejects.toThrow("登录状态已变化");
    advanceAuthGeneration();
    const current = authService.logout();
    expect(api.get).toHaveBeenCalledTimes(2);
    oldDone({ code: 200, data: { csrfToken: "old" } });
    await oldRejected;
    expect(authService.logout()).toBe(current);
    expect(api.get).toHaveBeenCalledTimes(2);
    newDone({ code: 200, data: { csrfToken: "current" } });
    await current;
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
