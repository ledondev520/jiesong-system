/**
 * Input: LazyAIAssistantMount、AI 面板状态、当前路径
 * Output: 停靠式 AI 助手的懒加载、开合、快捷键、?ai=1、移动全屏与 BOSS 边界测试
 * Pos: 全局 AI 面板宿主测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LazyAIAssistantMount } from "./LazyAIAssistantMount";
import { useAiPanelStore } from "@/store/ai-panel.store";

let mockPathname = "/dashboard";
let mockMobile = false;
let mockReadOnly = false;

vi.mock("@/lib/hooks/useMobile", () => ({ useMobile: () => mockMobile }));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => mockReadOnly,
}));

vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({
      presentation,
      pageContext,
      onClose,
    }: {
      presentation: string;
      pageContext: { route: string; recordId?: string };
      onClose: () => void;
    }) => (
      <div>
        AI 助手挂载体 {presentation} {pageContext.route}{" "}
        {pageContext.recordId ?? ""}
        <button onClick={onClose}>关闭面板</button>
      </div>
    ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

beforeEach(() => {
  mockPathname = "/dashboard";
  mockMobile = false;
  mockReadOnly = false;
  window.history.replaceState({}, "", "/dashboard");
  useAiPanelStore.setState({ open: false });
});

describe("LazyAIAssistantMount", () => {
  it("首次打开前不加载助手，打开后以停靠形态挂载并带页面上下文", () => {
    mockPathname = "/dashboard/purchases/pc-001";
    render(<LazyAIAssistantMount />);
    expect(screen.queryByText(/AI 助手挂载体/)).not.toBeInTheDocument();

    act(() => useAiPanelStore.getState().setOpen(true));
    expect(
      screen.getByText(
        "AI 助手挂载体 docked /dashboard/purchases/pc-001 pc-001",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-panel")).not.toHaveClass("md:hidden");
  });

  it("收起只隐藏面板，保留已挂载的对话", () => {
    useAiPanelStore.setState({ open: true });
    render(<LazyAIAssistantMount />);
    fireEvent.click(screen.getByText("关闭面板"));
    expect(useAiPanelStore.getState().open).toBe(false);
    expect(screen.getByTestId("ai-panel")).toHaveClass("md:hidden");
    expect(screen.getByText(/AI 助手挂载体/)).toBeInTheDocument();
  });

  it("Ctrl+J 与 ⌘+J 切换面板", () => {
    render(<LazyAIAssistantMount />);
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(useAiPanelStore.getState().open).toBe(true);
    fireEvent.keyDown(window, { key: "J", metaKey: true });
    expect(useAiPanelStore.getState().open).toBe(false);
  });

  it("?ai=1 打开面板并从地址栏移除该参数", () => {
    window.history.replaceState({}, "", "/dashboard?ai=1&keep=1");
    render(<LazyAIAssistantMount />);
    expect(useAiPanelStore.getState().open).toBe(true);
    expect(window.location.search).toBe("?keep=1");
  });

  it('手机用全屏面板，且别处记住的"已打开"不会自动弹出', () => {
    mockMobile = true;
    useAiPanelStore.setState({ open: true });
    render(<LazyAIAssistantMount />);
    expect(useAiPanelStore.getState().open).toBe(false);

    act(() => useAiPanelStore.getState().setOpen(true));
    expect(screen.getByTestId("ai-panel-sheet")).not.toHaveClass("hidden");
  });

  it("BOSS 没有 AI：不挂载也不响应快捷键", () => {
    mockReadOnly = true;
    useAiPanelStore.setState({ open: true });
    render(<LazyAIAssistantMount />);
    expect(screen.queryByText(/AI 助手挂载体/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(useAiPanelStore.getState().open).toBe(true);
  });

  it("手机面板是模态对话框：焦点移入并被限制在内，Escape 关闭后焦点回到触发者", () => {
    mockMobile = true;
    render(
      <>
        <button>打开AI</button>
        <LazyAIAssistantMount />
      </>,
    );
    const opener = screen.getByText("打开AI");
    opener.focus();
    act(() => useAiPanelStore.getState().setOpen(true));

    const sheet = screen.getByRole("dialog", { name: "AI 助手" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    const close = screen.getByText("关闭面板");
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    // 只有一个可聚焦元素时，Tab / Shift+Tab 都留在面板内
    expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(
      false,
    );

    fireEvent.keyDown(close, { key: "Escape" });
    expect(useAiPanelStore.getState().open).toBe(false);
    expect(opener).toHaveFocus();
  });

  it("拖动调整宽度时 pointermove 不写 localStorage，松手后才写入一次", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    useAiPanelStore.setState({ open: true });
    render(<LazyAIAssistantMount />);
    const handle = screen.getByRole("separator");
    setItem.mockClear();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 700 });
    fireEvent.pointerMove(window, { clientX: 650 });
    fireEvent.pointerMove(window, { clientX: 600 });
    expect(setItem).not.toHaveBeenCalled();
    expect(useAiPanelStore.getState().width).not.toBe(window.innerWidth - 600);
    expect(screen.getByTestId("ai-panel")).toHaveStyle({
      width: `${Math.min(640, Math.max(320, window.innerWidth - 600))}px`,
    });

    fireEvent.pointerUp(window);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(useAiPanelStore.getState().width).toBe(
      Math.min(640, Math.max(320, window.innerWidth - 600)),
    );
    setItem.mockRestore();
  });
});
