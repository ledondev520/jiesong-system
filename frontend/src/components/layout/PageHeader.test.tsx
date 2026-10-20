/**
 * Input: PageHeader组件、默认 Next Router 与显式返回动作
 * Output: 页面头部交互测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

describe("PageHeader", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it("点击返回时，优先走backHref", () => {
    const { getByRole } = render(
      <PageHeader title="测试页面" backHref="/dashboard" />,
    );
    fireEvent.click(getByRole("button", { name: "返回" }));
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("显式返回动作优先执行，不经过默认 router.push 或 router.back", () => {
    const onBack = vi.fn();
    const { getByRole } = render(
      <PageHeader title="测试页面" backHref="/dashboard" onBack={onBack} />,
    );
    fireEvent.click(getByRole("button", { name: "返回" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("显式展示的返回按钮也只执行自定义动作", () => {
    const onBack = vi.fn();
    const { getByRole } = render(
      <PageHeader title="测试页面" showBack onBack={onBack} />,
    );
    fireEvent.click(getByRole("button", { name: "返回" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("未传backHref时不显示返回按钮", () => {
    const { queryByRole } = render(<PageHeader title="测试页面" />);
    expect(queryByRole("button", { name: "返回" })).toBeNull();
  });

  it("showBack=true 时展示返回按钮并调用router.back", () => {
    const { getByRole } = render(<PageHeader title="测试页面" showBack />);
    fireEvent.click(getByRole("button", { name: "返回" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
