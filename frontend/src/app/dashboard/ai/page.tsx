/**
 * Input: AI 助手模块根路由
 * Output: 跳转到 AI 会话列表
 * Pos: AI 助手模块兼容入口
 */

import { redirect } from 'next/navigation';

export default function AiAssistantModulePage() {
  redirect('/dashboard/ai/sessions');
}
