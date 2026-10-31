/**
 * Input: AI 助手模块根路由
 * Output: 验证旧 /dashboard/ai 重定向到 /dashboard?ai=1（由停靠面板打开）
 * Pos: AI 助手入口兼容测试
 */

import { describe, expect, it, vi } from "vitest";
import AiAssistantModulePage from "./page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("AiAssistantModulePage", () => {
  it("旧 AI 工作区路由跳转到 /dashboard?ai=1", () => {
    AiAssistantModulePage();
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard?ai=1");
  });
});
