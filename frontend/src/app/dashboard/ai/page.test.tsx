/**
 * Input: AI 助手模块根路由
 * Output: 验证根路由回到 AI 会话页
 * Pos: AI 助手模块路由兼容测试
 */

import { describe, expect, it, vi } from 'vitest';
import AiAssistantModulePage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('AiAssistantModulePage', () => {
  it('AI 助手根路由跳转到 AI 会话页', () => {
    AiAssistantModulePage();

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/ai/sessions');
  });
});
