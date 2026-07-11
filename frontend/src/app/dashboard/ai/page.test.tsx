/**
 * Input: AI 助手模块根路由
 * Output: 验证根路由直接提供统一 AI 对话工作区
 * Pos: AI 助手主入口测试
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AiAssistantModulePage from './page';

vi.mock('@/components/layout/ModuleTabHeader', () => ({
  AI_TABS: [
    { href: '/dashboard/ai', label: '开始对话' },
    { href: '/dashboard/ai/sessions', label: '会话记录' },
  ],
  ModuleTabHeader: () => <nav aria-label="AI 助手">开始对话 会话记录</nav>,
}));

vi.mock('@/components/ai/AIAssistant', () => ({
  AIAssistant: ({ presentation }: { presentation?: string }) => (
    <div data-testid="ai-workspace">{presentation}</div>
  ),
}));

vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}));

describe('AiAssistantModulePage', () => {
  it('AI 助手根路由直接展示开始对话工作区', () => {
    render(<AiAssistantModulePage />);

    expect(screen.getByRole('navigation', { name: 'AI 助手' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 助手' })).toBeInTheDocument();
    expect(screen.getByTestId('ai-workspace')).toHaveTextContent('workspace');
  });
});
