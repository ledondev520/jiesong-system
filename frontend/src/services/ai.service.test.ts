/**
 * Input: AI 服务与 API 实例
 * Output: AI 服务单元测试
 * Pos: 前端服务测试
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import { aiService } from "./ai.service";

vi.mock("@/lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiService", () => {
  it("getSessions: 拉取会话列表", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("ok");

    await aiService.getSessions();

    expect(api.get).toHaveBeenCalledWith("/ai/sessions");
  });

  it("getChatHistory: 调用后端实际暴露的 history 端点", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("ok");

    await aiService.getChatHistory("session_1", 2, 50);

    expect(api.get).toHaveBeenCalledWith("/ai/history", {
      params: { sessionId: "session_1", page: 2, pageSize: 50 },
    });
  });

  it("deleteSession: 删除指定会话", async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("ok");

    await aiService.deleteSession("session_1");

    expect(api.delete).toHaveBeenCalledWith("/ai/sessions/session_1");
  });

  it("getTokenStats: 传递统计天数参数", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("ok");

    await aiService.getTokenStats(7);

    expect(api.get).toHaveBeenCalledWith("/ai/token-stats", {
      params: { days: 7 },
    });
  });

  it("getAgentToolRegistry: 拉取 Agent 工具注册表", async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("ok");

    await aiService.getAgentToolRegistry();

    expect(api.get).toHaveBeenCalledWith("/ai/agents/tools");
  });

  it("parseImageTokenUsage: 调用 AI 图片识别接口", async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("ok");

    await aiService.parseImageTokenUsage(
      "解析图片",
      "data:image/png;base64,xxx",
    );

    expect(api.post).toHaveBeenCalledWith("/ai/chat", {
      message: "解析图片",
      imageUrl: "data:image/png;base64,xxx",
    });
  });
});
