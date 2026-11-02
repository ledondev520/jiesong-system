/**
 * Input: AuthShell 与子内容
 * Output: 品牌名只出现一次、h1 归属规则、左面板要点、纯色壳（无毛玻璃/光晕类）
 * Pos: 认证外壳展示测试
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthShell } from "./AuthShell";

describe("AuthShell", () => {
  it("renders the card content inside <main> and the brand name exactly once", () => {
    render(
      <AuthShell>
        <p>卡片内容</p>
      </AuthShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("卡片内容");
    expect(screen.getAllByText("捷淞国际物流")).toHaveLength(1);
  });

  it("the brand name is not a heading by default (card title stays the only h1)", () => {
    render(
      <AuthShell>
        <h1>邮箱注册</h1>
      </AuthShell>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "邮箱注册" }),
    ).toBeInTheDocument();
  });

  it("brandHeading makes the brand name the page h1 (login page)", () => {
    render(
      <AuthShell brandHeading>
        <p>表单</p>
      </AuthShell>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "捷淞国际物流" }),
    ).toBeInTheDocument();
  });

  it("left panel lists the three live highlights, with decorative icons hidden", () => {
    const { container } = render(
      <AuthShell>
        <p>x</p>
      </AuthShell>,
    );
    for (const item of ["全程可追溯", "权限分明", "AI 助手随页可用"]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(container.querySelectorAll("img[alt='']").length).toBeGreaterThan(0);
    expect(container.querySelector("[class*='backdrop']")).toBeNull();
    expect(container.querySelector("[class*='blur']")).toBeNull();
  });
});
