import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from './share-button';

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

// Mock navigator.share
Object.assign(navigator, {
  share: vi.fn(),
});

describe('share-button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染分享按钮', () => {
    render(<ShareButton />);
    expect(screen.getByRole('button', { name: /分享/ })).toBeInTheDocument();
  });

  it('点击按钮应该打开下拉菜单', async () => {
    const user = userEvent.setup();
    render(<ShareButton />);

    await user.click(screen.getByRole('button', { name: /分享/ }));
    expect(screen.getByText('复制链接')).toBeInTheDocument();
  });

  it('应该支持自定义标题', () => {
    render(<ShareButton title="自定义标题" />);
    expect(screen.getByRole('button', { name: /分享/ })).toBeInTheDocument();
  });

  it('应该支持自定义 URL', async () => {
    const user = userEvent.setup();
    const mockWriteText = vi.fn();
    Object.assign(navigator.clipboard, { writeText: mockWriteText });

    render(<ShareButton url="https://example.com/test" />);
    await user.click(screen.getByRole('button', { name: /分享/ }));
    await user.click(screen.getByText('复制链接'));

    expect(mockWriteText).toHaveBeenCalledWith('https://example.com/test');
  });
});
