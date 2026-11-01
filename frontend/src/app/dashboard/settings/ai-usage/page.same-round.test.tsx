/**
 * Input: AI 会话页面（React StrictMode 下重复挂载）、同一轮完成的两次合成工具注册表请求
 * Output: 重叠注册表请求的成功/失败回调顺序与原 async try/await 一致、成功结果不被同轮失败清空的回归测试
 * Pos: AI 会话页面请求回调时序回归测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import api from "@/lib/axios";
import AiSessionsPage from "./page";

const stableParams = vi.hoisted(() => new URLSearchParams());
const mockGetSessions = vi.hoisted(() => vi.fn());
const mockGetAgentToolRegistry = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/settings/ai-usage",
  useSearchParams: () => stableParams,
}));
vi.mock("@/services/ai.service", () => ({
  aiService: {
    getSessions: (...args: unknown[]) => mockGetSessions(...args),
    getStandaloneTokenUsage: async () => ({ data: [] }),
    getAgentToolRegistry: (...args: unknown[]) =>
      mockGetAgentToolRegistry(...args),
    deleteSession: vi.fn(),
  },
}));
vi.mock("@/lib/axios", () => ({ default: { get: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));
vi.mock("./components/AiTokenUsageChart", () => ({ default: () => null }));

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const registry = {
  data: {
    primaryAgentType: "unified",
    viewerRole: "FINANCE",
    domains: [
      {
        domain: "finance",
        label: "财务",
        description: "合成域",
        toolCount: 2,
        readCount: 1,
        writeCount: 1,
        availableCount: 2,
        availableWriteCount: 1,
        compositeToolCount: 0,
      },
    ],
    legacyAgentTypes: [],
    tools: [
      {
        name: "SearchEntities",
        domain: "finance",
        access: "read",
        confirmationRequired: false,
        isComposite: false,
        allowedRoles: ["ADMIN"],
        description: "",
        availableForViewer: true,
      },
      {
        name: "WriteX",
        domain: "finance",
        access: "write",
        confirmationRequired: true,
        isComposite: false,
        allowedRoles: ["ADMIN"],
        description: "",
        availableForViewer: true,
      },
    ],
  },
};

/** StrictMode 下两次注册表请求都在途时，按指定顺序在同一轮中完成 */
async function runOverlappingRegistry(
  settlements: Array<{ index: 0 | 1; ok: boolean }>,
) {
  localStorage.clear();
  sessionStorage.clear();
  mockGetSessions.mockReset();
  mockGetAgentToolRegistry.mockReset();
  mockGetSessions.mockResolvedValue({ data: [] });
  vi.mocked(api.get).mockImplementation(async () => ({
    data: {
      period: "7d",
      totalRequests: 0,
      totalTokens: 0,
      byModel: [],
      daily: [],
    },
  }));
  const requests = [defer<unknown>(), defer<unknown>()];
  mockGetAgentToolRegistry
    .mockReturnValueOnce(requests[0].promise)
    .mockReturnValueOnce(requests[1].promise);

  const view = render(
    <StrictMode>
      <AiSessionsPage />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(mockGetAgentToolRegistry).toHaveBeenCalledTimes(2),
  );
  await act(async () => {
    for (const { index, ok } of settlements) {
      if (ok) requests[index].resolve(registry);
      else requests[index].reject(new Error("registry failed"));
    }
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const text = document.body.textContent ?? "";
  view.unmount();
  return text;
}

describe("AI 会话页面同轮请求回调时序", () => {
  it("同一轮先完成失败请求、再完成成功请求时，显示成功的注册表", async () => {
    const text = await runOverlappingRegistry([
      { index: 0, ok: false },
      { index: 1, ok: true },
    ]);
    expect(text).toContain("主入口 unified");
    expect(text).not.toContain("注册表加载失败或暂不可用。");
  }, 20000);

  it("同一轮后发失败请求先完成、先发成功请求后完成时，显示成功的注册表", async () => {
    const text = await runOverlappingRegistry([
      { index: 1, ok: false },
      { index: 0, ok: true },
    ]);
    expect(text).toContain("主入口 unified");
    expect(text).not.toContain("注册表加载失败或暂不可用。");
  }, 20000);
});
