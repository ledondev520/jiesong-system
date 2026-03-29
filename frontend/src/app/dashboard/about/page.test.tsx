import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AboutAgentPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/about',
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('AboutAgentPage', () => {
  it('渲染远程 Agent、本机 CLI 和一句话提示词示例', async () => {
    render(<AboutAgentPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '关于 Agent 使用' })).toBeInTheDocument();
      expect(screen.getByText('远程 Agent（推荐）')).toBeInTheDocument();
      expect(screen.getByText('本机 Agent / CLI')).toBeInTheDocument();
      expect(screen.getByText('一句话提示词示例')).toBeInTheDocument();
      expect(screen.getAllByText(/tools\/list/).length).toBeGreaterThan(0);
      expect(screen.getByText(/npm run agent:cli -- search/)).toBeInTheDocument();
      expect(screen.getByText(/curl -fsSL .*\/agent\/install\.sh \| bash/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '复制安装命令' })).toBeInTheDocument();
    });
  });
});
