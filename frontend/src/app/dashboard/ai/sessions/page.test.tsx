/**
 * Input: AI 会话页面、aiService、toast
 * Output: AI 会话页面交互测试
 * Pos: 前端业务页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiSessionsPage from './page';

const mockGetSessions = vi.fn();
const mockGetStandaloneTokenUsage = vi.fn();
const mockDeleteSession = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard/ai/sessions',
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getSessions: (...args: unknown[]) => mockGetSessions(...args),
    getStandaloneTokenUsage: (...args: unknown[]) => mockGetStandaloneTokenUsage(...args),
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('AiSessionsPage', () => {
  beforeEach(() => {
    mockGetSessions.mockReset();
    mockGetStandaloneTokenUsage.mockReset();
    mockGetStandaloneTokenUsage.mockResolvedValue({ data: [] });
    mockDeleteSession.mockReset();
    mockToastError.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('加载后展示会话列表', async () => {
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_1',
          _count: { _all: 3 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
        },
      ],
    });

    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AI 会话列表' })).toBeInTheDocument();
      expect(screen.getAllByText('session_1').length).toBeGreaterThan(0);
    });
  });

  it('点击删除调用删除接口', async () => {
    mockGetSessions.mockResolvedValue({
      data: [{ sessionId: 'session_1', _count: 1, _max: { createdAt: null } }],
    });
    mockDeleteSession.mockResolvedValue({});

    const user = userEvent.setup();
    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('删除会话-session_1')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('删除会话-session_1'));

    expect(mockDeleteSession).toHaveBeenCalledWith('session_1');
  });

  it('加载失败时提示错误', async () => {
    mockGetSessions.mockRejectedValue(new Error('failed'));
    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载 AI 会话失败');
    });
  });
});
