/**
 * Input: LazyAIAssistantMount、当前路径
 * Output: AI 助手懒挂载边界测试
 * Pos: 全局 AI 挂载组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LazyAIAssistantMount } from './LazyAIAssistantMount';

let mockPathname = '/dashboard';
let mockMobile = false;

vi.mock('@/lib/hooks/useMobile', () => ({ useMobile: () => mockMobile }));

vi.mock('next/dynamic', () => ({
  default: () => () => <div>AI 助手挂载体</div>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('LazyAIAssistantMount', () => {
  it('业务页面仍会挂载 AI 助手', () => {
    mockPathname = '/dashboard/finance';
    render(<LazyAIAssistantMount />);

    expect(screen.getByText('AI 助手挂载体')).toBeInTheDocument();
  });

  it('AI 模块页不再重复挂载全局助手', () => {
    mockPathname = '/dashboard/ai/sessions';
    render(<LazyAIAssistantMount />);

    expect(screen.queryByText('AI 助手挂载体')).not.toBeInTheDocument();
  });

  it('手机工作台通过更多进入 AI，不再用悬浮入口遮挡列表', () => {
    mockPathname = '/dashboard/contracts';
    mockMobile = true;
    render(<LazyAIAssistantMount />);
    expect(screen.queryByText('AI 助手挂载体')).not.toBeInTheDocument();
    mockMobile = false;
  });
});
