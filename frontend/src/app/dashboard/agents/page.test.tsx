import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentsPage from './page';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockIssueCredential = vi.fn();
const mockRotateCredential = vi.fn();
const mockRevokeCredential = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/agents',
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/agent.service', () => ({
  agentService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: vi.fn(),
    issueCredential: (...args: unknown[]) => mockIssueCredential(...args),
    rotateCredential: (...args: unknown[]) => mockRotateCredential(...args),
    revokeCredential: (...args: unknown[]) => mockRevokeCredential(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('AgentsPage', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockCreate.mockReset();
    mockIssueCredential.mockReset();
    mockRotateCredential.mockReset();
    mockRevokeCredential.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('渲染 Agent 列表并显示凭证操作按钮', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [{
          id: 'agent-1',
          name: '采购机器人',
          slug: 'purchase-bot',
          status: 'ACTIVE',
          defaultMode: 'READ_INGEST',
          createdAt: '2026-03-29T10:00:00.000Z',
          updatedAt: '2026-03-29T10:00:00.000Z',
          grants: [{ resource: 'search', action: 'read' }],
          credentials: [{
            id: 'cred-1',
            credentialKey: 'abc123',
            label: 'OpenClaw',
            status: 'ACTIVE',
            secretPreview: 'dead...beef',
            expiresAt: '2026-04-03T10:00:00.000Z',
            createdAt: '2026-03-29T10:00:00.000Z',
          }],
        }],
      },
    });

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Agent 管理' })).toBeInTheDocument();
      expect(screen.getByText('采购机器人')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '签发凭证' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '轮换' })).toBeInTheDocument();
      expect(screen.getByText('即将过期')).toBeInTheDocument();
    });
  });

  it('点击新增 Agent 会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<AgentsPage />);

    await user.click(screen.getByRole('button', { name: /新增 Agent/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新增 Agent' })).toBeInTheDocument();
  });

  it('签发凭证后展示一次性 token', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [{
          id: 'agent-1',
          name: '采购机器人',
          slug: 'purchase-bot',
          status: 'ACTIVE',
          defaultMode: 'READ_INGEST',
          createdAt: '2026-03-29T10:00:00.000Z',
          updatedAt: '2026-03-29T10:00:00.000Z',
          grants: [],
          credentials: [],
        }],
      },
    });
    mockIssueCredential.mockResolvedValue({
      data: {
        credential: {
          id: 'cred-1',
          credentialKey: 'abc123',
          status: 'ACTIVE',
          createdAt: '2026-03-29T10:00:00.000Z',
        },
        token: 'jsa_abc123.secret456',
      },
    });
    const user = userEvent.setup();

    render(<AgentsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '签发凭证' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '签发凭证' }));

    await waitFor(() => {
      expect(mockIssueCredential).toHaveBeenCalledWith('agent-1', 'purchase-bot-credential', 90);
      expect(screen.getByText('一次性 Token')).toBeInTheDocument();
      expect(screen.getByText('jsa_abc123.secret456')).toBeInTheDocument();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<AgentsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载 Agent 列表失败');
    });
  });
});
