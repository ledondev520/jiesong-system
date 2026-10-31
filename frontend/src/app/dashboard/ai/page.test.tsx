/**
 * Input: AI 助手模块根路由
 * Output: 验证根路由直接提供统一 AI 对话工作区
 * Pos: AI 助手主入口测试
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AiAssistantModulePage from "./page";

vi.mock("@/components/ai/AIAssistant", () => ({
  AIAssistant: ({ presentation }: { presentation?: string }) => (
    <div data-testid="ai-workspace">{presentation}</div>
  ),
}));

vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({
    title,
    description,
    actions,
  }: {
    title: string;
    description?: string;
    actions?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </header>
  ),
}));

describe("AiAssistantModulePage", () => {
  it("AI 助手根路由直接展示开始对话工作区", () => {
    render(<AiAssistantModulePage />);

    expect(screen.getByRole("link", { name: "会话记录" })).toHaveAttribute(
      "href",
      "/dashboard/ai/sessions",
    );
    expect(
      screen.getByRole("heading", { name: "AI 助手" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-workspace")).toHaveTextContent("workspace");
  });
});
