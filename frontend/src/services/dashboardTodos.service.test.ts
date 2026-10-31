/**
 * Input: 首页待办服务、HTTP Adapter
 * Output: 请求路径与禁用缓存契约测试
 * Pos: 首页待办前端 Interface 测试
 */

import { describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import { dashboardTodosService } from "./dashboardTodos.service";

vi.mock("@/lib/axios", () => ({ default: { get: vi.fn() } }));

describe("dashboardTodosService", () => {
  it("读取待办且不使用客户端 GET 缓存", async () => {
    const response = {
      code: 200,
      message: "ok",
      data: { role: "ADMIN", lists: {} },
    };
    vi.mocked(api.get).mockResolvedValue(response);

    await expect(dashboardTodosService.get()).resolves.toEqual(response);

    expect(api.get).toHaveBeenCalledWith("/dashboard/todos", {
      cache: { enabled: false },
    });
  });
});
