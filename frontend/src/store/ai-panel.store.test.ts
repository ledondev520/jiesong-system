import { describe, expect, it } from "vitest";
import {
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  clampAiPanelWidth,
  useAiPanelStore,
} from "./ai-panel.store";

describe("ai panel store", () => {
  it("宽度限制在 320–640 之间，非法值回到默认", () => {
    expect(clampAiPanelWidth(100)).toBe(AI_PANEL_MIN_WIDTH);
    expect(clampAiPanelWidth(5000)).toBe(AI_PANEL_MAX_WIDTH);
    expect(clampAiPanelWidth(Number.NaN)).toBe(400);
    useAiPanelStore.getState().setWidth(480);
    expect(useAiPanelStore.getState().width).toBe(480);
  });

  it("toggle 切换开合并写入浏览器记忆", () => {
    useAiPanelStore.setState({ open: false });
    useAiPanelStore.getState().toggle();
    expect(useAiPanelStore.getState().open).toBe(true);
    expect(JSON.parse(localStorage.getItem("ai-panel") ?? "{}").state.open).toBe(
      true,
    );
  });
});
