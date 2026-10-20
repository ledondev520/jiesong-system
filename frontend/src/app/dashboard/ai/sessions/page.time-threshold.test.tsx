/**
 * Input: AI 会话页面、aiService、可控时钟
 * Output: 超时阈值随时间推进更新的回归测试（页面停留期间无需重新加载列表）
 * Pos: 前端业务页测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import AiSessionsPage from "./page";
import api from "@/lib/axios";

const mockGetSessions = vi.fn();
const mockGetStandaloneTokenUsage = vi.fn();
const mockGetAgentToolRegistry = vi.fn();
const mockSearchParams = new URLSearchParams("sort=risk&actionFilter=all");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/ai/sessions",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/services/ai.service", () => ({
  aiService: {
    getSessions: (...args: unknown[]) => mockGetSessions(...args),
    getStandaloneTokenUsage: (...args: unknown[]) =>
      mockGetStandaloneTokenUsage(...args),
    getAgentToolRegistry: (...args: unknown[]) =>
      mockGetAgentToolRegistry(...args),
    deleteSession: vi.fn(),
  },
}));

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

vi.mock("./components/AiTokenUsageChart", () => ({
  default: () => <div data-testid="ai-token-usage-chart" />,
}));

describe("AiSessionsPage 超时阈值随时间更新", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockGetSessions.mockReset();
    mockGetStandaloneTokenUsage.mockReset();
    mockGetStandaloneTokenUsage.mockResolvedValue({ data: [] });
    mockGetAgentToolRegistry.mockReset();
    mockGetAgentToolRegistry.mockResolvedValue({ data: null });
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        period: "7d",
        totalRequests: 0,
        totalTokens: 0,
        byModel: [],
        daily: [],
      },
    });
  });

  it("页面停留跨过 2 小时阈值后，无需重新加载列表即可更新超时待确认摘要", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    // 待确认动作创建于 119 分钟前，首屏尚未超时
    vi.setSystemTime(new Date("2026-10-20T02:00:00.000Z"));
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: "session_pending_near_threshold",
          _count: { _all: 1 },
          _max: { createdAt: "2026-10-20T00:01:00.000Z" },
          pendingActionSummary: [
            {
              actionId: "pa-pending-near",
              actionType: "UpdateInventoryStatus",
              description: "更新库存状态",
              status: "pending",
              createdAt: "2026-10-20T00:01:00.000Z",
              timeline: [
                {
                  type: "created",
                  status: "pending",
                  detail: "更新库存状态",
                  at: "2026-10-20T00:01:00.000Z",
                },
              ],
            },
          ],
        },
      ],
    });

    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("有待确认动作").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("超时待确认 1")).not.toBeInTheDocument();

    // 时间推进 2 分钟（跨过 2 小时阈值），期间不重新加载会话列表
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    await waitFor(() => {
      expect(screen.getByText("超时待确认 1")).toBeInTheDocument();
    });
    expect(mockGetSessions).toHaveBeenCalledTimes(1);
  });
});
