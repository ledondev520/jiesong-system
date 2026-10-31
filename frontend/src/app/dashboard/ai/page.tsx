/**
 * Input: 无
 * Output: 重定向到 /dashboard?ai=1，由停靠面板宿主打开 AI 助手面板
 * Pos: 旧 AI 工作区入口兼容 stub；AI 现在是每个 dashboard 页面右侧的侧栏面板
 */

import { redirect } from "next/navigation";

export default function AiAssistantModulePage() {
  redirect("/dashboard?ai=1");
}
