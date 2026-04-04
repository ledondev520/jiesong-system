import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpMenu } from './help-menu';

describe('help-menu', () => {
  it('应该渲染帮助按钮', () => {
    render(<HelpMenu />);
    expect(screen.getByRole('button', { name: '帮助' })).toBeInTheDocument();
  });

  it('点击按钮应该打开帮助菜单', async () => {
    const user = userEvent.setup();
    render(<HelpMenu />);

    await user.click(screen.getByRole('button', { name: '帮助' }));
    expect(screen.getByText('使用指南')).toBeInTheDocument();
    expect(screen.getByText('常见问题')).toBeInTheDocument();
    expect(screen.getByText('在线支持')).toBeInTheDocument();
  });

  it('帮助链接应该存在', async () => {
    const user = userEvent.setup();
    render(<HelpMenu />);

    await user.click(screen.getByRole('button', { name: '帮助' }));
    const guideLink = screen.getByText('使用指南').closest('a');
    expect(guideLink).toHaveAttribute('href', '/help/guide');
  });
});
