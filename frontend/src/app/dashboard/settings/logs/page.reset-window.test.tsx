/**
 * Input: SystemLogsPage、真实 React 调度（非 act 环境，被动 effect 晚于提交一个任务执行）、合成日志请求
 * Output: ① 关键词防抖提交后、被动 effect 发出新请求之前到达的旧响应不得把渲染期重置的 loading 改回 false；
 *         ② 非第 1 页时改关键词，仍按原顺序先以旧页码 + 新关键词请求、再请求第 1 页（保留中间请求）
 * Pos: 系统日志页加载状态 resetPendingRef 窗口与请求顺序回归测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import SystemLogsPage from "./page";

const mockGetSystemLogs = vi.hoisted(() => vi.fn());

const mockUser = vi.hoisted(() => ({ id: "u1", role: "ADMIN" }));

vi.mock("@/store/auth.store", () => ({
  // 与真实 store 一致：同一用户在多次渲染间保持同一引用
  useAuthStore: (selector: (state: { user: unknown }) => unknown) =>
    selector({ user: mockUser }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings/logs",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/services/system.service", () => ({
  getSystemLogs: (...args: unknown[]) => mockGetSystemLogs(...args),
  exportSystemLogsCsv: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const page = (n: number, totalPages = 3) => ({
  data: {
    items: [
      {
        id: "log-" + n,
        userId: "u1",
        action: "UPDATE",
        entity: "Setting",
        entityId: "s1",
        createdAt: "2026-10-01T00:00:00.000Z",
        user: { id: "u1", name: "管理员" + n, username: "admin" },
      },
    ],
    pagination: { total: 60, page: n, pageSize: 20, totalPages },
  },
});

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await wait(5);
  expect(check()).toBe(true);
}

describe("SystemLogsPage 加载状态窗口与请求顺序", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousActEnvironment: unknown;
  let onCommit: (() => void) | null;

  beforeEach(() => {
    // 非 act 环境下默认优先级更新的被动 effect 在独立任务中执行，才能复现提交与被动 effect 之间的窗口
    previousActEnvironment = (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    mockGetSystemLogs.mockReset();
    onCommit = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(
      <Profiler id="logs" onRender={() => onCommit?.()}>
        <SystemLogsPage />
      </Profiler>,
    );
  });

  afterEach(async () => {
    root.unmount();
    container.remove();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }
    ).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    await nextTask();
  });

  const typeKeyword = (value: string) =>
    fireEvent.change(
      container.querySelector(
        'input[placeholder="搜索用户、操作、业务模块..."]',
      )!,
      { target: { value } },
    );

  it.each([
    ["成功", (old: ReturnType<typeof defer<unknown>>) => old.resolve(page(1))],
    [
      "失败",
      (old: ReturnType<typeof defer<unknown>>) =>
        old.reject(new Error("旧请求失败")),
    ],
  ])(
    "旧请求%s落在窗口内时，新请求在途仍显示加载中",
    async (_label, settleOld) => {
      const oldRequest = defer<unknown>();
      const newRequest = defer<unknown>();
      mockGetSystemLogs
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(newRequest.promise);
      await until(() => mockGetSystemLogs.mock.calls.length === 1);

      typeKeyword("abc");
      // 输入本身的提交不结算；只在 400ms 防抖提交时于提交阶段结算旧请求
      await wait(30);
      let callsWhenSettled = -1;
      onCommit = () => {
        onCommit = null;
        callsWhenSettled = mockGetSystemLogs.mock.calls.length;
        settleOld(oldRequest);
      };
      await until(() => mockGetSystemLogs.mock.calls.length === 2);
      await nextTask();

      expect(callsWhenSettled).toBe(1);
      expect(mockGetSystemLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, keyword: "abc" }),
      );
      expect(container.textContent).toContain("加载中...");

      newRequest.resolve(page(1, 1));
      await until(() => !(container.textContent ?? "").includes("加载中..."));
    },
  );

  it("非第 1 页时改关键词：先按旧页码 + 新关键词请求，再请求第 1 页", async () => {
    mockGetSystemLogs.mockImplementation(async (params: { page: number }) =>
      page(params.page),
    );
    await until(() => (container.textContent ?? "").includes("第 1/3 页"));
    const nextButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("下一页"),
    )!;
    fireEvent.click(nextButton);
    await until(() => (container.textContent ?? "").includes("第 2/3 页"));

    typeKeyword("abc");
    await until(() => mockGetSystemLogs.mock.calls.length === 4);
    await wait(20);

    expect(mockGetSystemLogs.mock.calls.map(([params]) => params)).toEqual([
      { page: 1, pageSize: 20 },
      { page: 2, pageSize: 20 },
      { page: 2, pageSize: 20, keyword: "abc" },
      { page: 1, pageSize: 20, keyword: "abc" },
    ]);
  });
});
