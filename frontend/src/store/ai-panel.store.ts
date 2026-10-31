/** AI 助手停靠面板的开合与宽度；仅保存界面偏好，按浏览器记忆（localStorage），不含任何会话内容。 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const AI_PANEL_MIN_WIDTH = 320;
export const AI_PANEL_MAX_WIDTH = 640;
export const AI_PANEL_DEFAULT_WIDTH = 400;

export const clampAiPanelWidth = (width: number) =>
  Math.min(
    AI_PANEL_MAX_WIDTH,
    Math.max(
      AI_PANEL_MIN_WIDTH,
      Math.round(Number(width)) || AI_PANEL_DEFAULT_WIDTH,
    ),
  );

interface AiPanelState {
  open: boolean;
  width: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setWidth: (width: number) => void;
}

export const useAiPanelStore = create<AiPanelState>()(
  persist(
    (set) => ({
      open: false,
      width: AI_PANEL_DEFAULT_WIDTH,
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
      setWidth: (width) => set({ width: clampAiPanelWidth(width) }),
    }),
    {
      name: "ai-panel",
      // localStorage 不可用（隐私模式等）时 createJSONStorage 返回 undefined，面板仍可用但不记忆。
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ open: state.open, width: state.width }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AiPanelState>;
        return {
          ...current,
          open: saved.open === true,
          width: clampAiPanelWidth(saved.width ?? current.width),
        };
      },
    },
  ),
);
