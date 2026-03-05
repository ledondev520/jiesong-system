/**
 * Input: AIGreeting组件、AI greeting API
 * Output: AI问候组件测试结果
 * Pos: 工作台问候组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIGreeting } from './AIGreeting';

const mockGetGreeting = vi.fn();

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getGreeting: (...args: unknown[]) => mockGetGreeting(...args),
  },
}));

describe('AIGreeting', () => {
  beforeEach(() => {
    mockGetGreeting.mockReset();
  });

  it('加载后展示问候语和歌曲信息', async () => {
    mockGetGreeting.mockResolvedValue({
      data: {
        greeting: '今天也要加油呀',
        songName: '倔强',
        lyrics: ['逆风的方向', '更适合飞翔'],
        source: 'ai',
      },
    });

    render(<AIGreeting />);

    await waitFor(() => {
      expect(screen.getByText('今天也要加油呀')).toBeInTheDocument();
      expect(screen.getByText('逆风的方向')).toBeInTheDocument();
      expect(screen.getByText('《倔强》')).toBeInTheDocument();
    });
  });

  it('点击关闭后隐藏卡片', async () => {
    mockGetGreeting.mockResolvedValue({
      data: {
        greeting: '你好',
        songName: '温柔',
        lyrics: [],
        source: 'ai',
      },
    });

    const user = userEvent.setup();
    render(<AIGreeting />);

    await waitFor(() => {
      expect(screen.getByText('你好')).toBeInTheDocument();
    });

    const closeButton = screen.getAllByRole('button')[0];
    await user.click(closeButton);

    expect(screen.queryByText('你好')).not.toBeInTheDocument();
  });
});
