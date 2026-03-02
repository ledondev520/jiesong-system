/**
 * Input: ThemeToggle 组件
 * Output: 主题切换交互测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

const mockSetTheme = vi.fn();
let mockResolvedTheme: string | undefined = 'light';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockReset();
    mockResolvedTheme = 'light';
  });

  it('浅色模式下点击切到暗色', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: '切换到夜间模式' });
    await user.click(button);

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('深色模式下点击切到浅色', async () => {
    mockResolvedTheme = 'dark';
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: '切换到白天模式' });
    await user.click(button);

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
