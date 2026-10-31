"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useBusinessReadOnly } from "@/lib/hooks/useBusinessReadOnly";
import { useMobile } from "@/lib/hooks/useMobile";
import { getAiPageContext } from "@/lib/ai-page-context";
import {
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  useAiPanelStore,
} from "@/store/ai-panel.store";
import { cn } from "@/lib/utils";

const LazyAIAssistant = dynamic(
  () =>
    import("@/components/ai/AIAssistant").then((module) => module.AIAssistant),
  {
    ssr: false,
    loading: () => null,
  },
);

const KEYBOARD_STEP = 24;

/**
 * 停靠式 AI 助手：桌面是内容区右侧的一列（内容区随之变窄，不遮挡），手机是点开后的全屏面板。
 * 首次打开前不加载 AIAssistant 代码；打开过之后收起只是隐藏，保留当前对话。BOSS 无 AI，什么都不挂载。
 */
export function LazyAIAssistantMount() {
  const readOnly = useBusinessReadOnly();
  const pathname = usePathname();
  const isMobile = useMobile();
  const open = useAiPanelStore((state) => state.open);
  const width = useAiPanelStore((state) => state.width);
  const setOpen = useAiPanelStore((state) => state.setOpen);
  const setWidth = useAiPanelStore((state) => state.setWidth);
  const [everOpened, setEverOpened] = useState(open);
  const dragging = useRef(false);
  const initialized = useRef(false);

  if (open && !everOpened) setEverOpened(true);

  // 手机只在点按后才全屏打开：别处记住的"已打开"不在手机上自动弹出
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (isMobile) setOpen(false);
  }, [isMobile, setOpen]);

  // ?ai=1（旧 /dashboard/ai 入口、分享链接）打开面板，并从地址栏移除参数
  useEffect(() => {
    if (readOnly) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("ai") !== "1") return;
    setOpen(true);
    url.searchParams.delete("ai");
    window.history.replaceState(window.history.state, "", url);
  }, [pathname, readOnly, setOpen]);

  // Ctrl/⌘ + J 切换面板
  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        useAiPanelStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readOnly]);

  // 拖动左缘调整宽度；pointer 事件挂在 window 上，拖出手柄也不丢
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragging.current) setWidth(window.innerWidth - event.clientX);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setWidth]);

  if (readOnly || !everOpened) return null;

  const assistant = (
    <LazyAIAssistant
      presentation="docked"
      onClose={() => setOpen(false)}
      pageContext={getAiPageContext(pathname)}
    />
  );

  if (isMobile) {
    return (
      <div
        data-testid="ai-panel-sheet"
        className={cn("fixed inset-0 z-[150] bg-background", !open && "hidden")}
      >
        {assistant}
      </div>
    );
  }

  return (
    <div
      data-testid="ai-panel"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 border-l bg-background md:flex",
        !open && "md:hidden",
      )}
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整 AI 助手面板宽度"
        aria-valuemin={AI_PANEL_MIN_WIDTH}
        aria-valuemax={AI_PANEL_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none hover:bg-primary/30 focus-visible:bg-primary/40"
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setWidth(width + KEYBOARD_STEP);
          if (event.key === "ArrowRight") setWidth(width - KEYBOARD_STEP);
        }}
      />
      <div className="min-w-0 flex-1">{assistant}</div>
    </div>
  );
}
