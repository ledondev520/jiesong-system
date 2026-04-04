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
      expect(screen.getByRole('link', { name: '打开项目驾驶舱' })).toBeInTheDocument();
      expect(screen.getByText('远程 Agent（推荐）')).toBeInTheDocument();
      expect(screen.getByText('本机 Agent / CLI')).toBeInTheDocument();
      expect(screen.getByText('一句话提示词示例')).toBeInTheDocument();
      expect(screen.getByText('OpenClaw 客户端模板')).toBeInTheDocument();
      expect(screen.getByText('通用 MCP 客户端模板')).toBeInTheDocument();
      expect(screen.getAllByText(/tools\/list/).length).toBeGreaterThan(0);
      expect(screen.getByText(/npm run agent:cli -- search/)).toBeInTheDocument();
      expect(screen.getByText(/curl -fsSL .*\/agent\/install\.sh \| bash/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '复制安装命令' })).toBeInTheDocument();
    });
  });

  it('展示当前实现的固定能力集说明，而不是手动配权限文案', async () => {
    render(<AboutAgentPage />);

    await waitFor(() => {
      expect(screen.getByText(/当前实现会自动赋予固定能力集/)).toBeInTheDocument();
      expect(screen.getAllByText((_, element) => {
        const text = element?.textContent || '';
        return text.includes('search.read') && text.includes('purchase.create/update') && text.includes('supplier.create/update');
      }).length).toBeGreaterThan(0);
    });
  });
});
