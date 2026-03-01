/**
 * Input: Token 统计页面、aiService、toast
 * Output: Token 统计页面交互测试
 * Pos: 前端业务页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiTokenStatsPage from './page';

const mockGetTokenStats = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getTokenStats: (...args: unknown[]) => mockGetTokenStats(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('AiTokenStatsPage', () => {
  beforeEach(() => {
    mockGetTokenStats.mockReset();
    mockToastError.mockReset();
  });

  it('展示统计卡片与模型表格', async () => {
    mockGetTokenStats.mockResolvedValue({
      data: {
        period: '30天',
        totalRequests: 10,
        totalTokens: 1000,
        promptTokens: 400,
        outputTokens: 600,
        byModel: [{ model: 'kimi-k2', requests: 10, tokens: 1000 }],
      },
    });

    render(<AiTokenStatsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Token 用量统计' })).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('kimi-k2')).toBeInTheDocument();
    });
  });

  it('切换天数会重新请求统计', async () => {
    mockGetTokenStats.mockResolvedValue({
      data: {
        period: '30天',
        totalRequests: 0,
        totalTokens: 0,
        promptTokens: 0,
        outputTokens: 0,
        byModel: [],
      },
    });

    const user = userEvent.setup();
    render(<AiTokenStatsPage />);

    await waitFor(() => {
      expect(mockGetTokenStats).toHaveBeenCalledWith(30);
    });

    await user.click(screen.getByRole('button', { name: '7天' }));

    await waitFor(() => {
      expect(mockGetTokenStats).toHaveBeenCalledWith(7);
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetTokenStats.mockRejectedValue(new Error('failed'));

    render(<AiTokenStatsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载 Token 统计失败');
    });
  });
});
