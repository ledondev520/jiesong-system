/**
 * Input: AI 会话页面、aiService、toast
 * Output: AI 会话页面交互测试
 * Pos: 前端业务页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiSessionsPage from './page';
import api from '@/lib/axios';

const mockGetSessions = vi.fn();
const mockGetStandaloneTokenUsage = vi.fn();
const mockGetAgentToolRegistry = vi.fn();
const mockDeleteSession = vi.fn();
const mockToastError = vi.fn();
const mockRouterReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: mockRouterReplace }),
  usePathname: () => '/dashboard/ai/sessions',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getSessions: (...args: unknown[]) => mockGetSessions(...args),
    getStandaloneTokenUsage: (...args: unknown[]) => mockGetStandaloneTokenUsage(...args),
    getAgentToolRegistry: (...args: unknown[]) => mockGetAgentToolRegistry(...args),
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  },
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
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
    mockGetAgentToolRegistry.mockReset();
    mockGetAgentToolRegistry.mockResolvedValue({
      data: {
        primaryAgentType: 'unified',
        viewerRole: 'FINANCE',
        domains: [
          { domain: 'finance', label: '财务', description: '围绕应收、应付、回款、收款池与财务风险做事实查询和判断', toolCount: 2, readCount: 1, writeCount: 1, availableCount: 2, availableWriteCount: 1, compositeToolCount: 1 },
          { domain: 'procurement', label: '采购', description: '围绕采购合同、供应商、付款与到货执行做查询和诊断', toolCount: 2, readCount: 1, writeCount: 1, availableCount: 1, availableWriteCount: 0, compositeToolCount: 1 },
        ],
        legacyAgentTypes: ['finance', 'export', 'executive'],
        tools: [
          { name: 'SearchEntities', domain: 'search', access: 'read', confirmationRequired: false, isComposite: false, allowedRoles: ['ADMIN'], description: '', availableForViewer: true },
          { name: 'DiagnoseSalesContractFlow', domain: 'sales-export', access: 'read', confirmationRequired: false, isComposite: true, allowedRoles: ['ADMIN'], description: '按出口合同号做跨域诊断', availableForViewer: true },
          { name: 'UpdateSystemConfig', domain: 'system', access: 'write', confirmationRequired: true, isComposite: false, allowedRoles: ['ADMIN'], description: '', availableForViewer: false },
        ],
      },
    });
    (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (String(url).includes('/ai/token-stats')) {
        return Promise.resolve({ data: { period: '7d', totalRequests: 0, totalTokens: 0, byModel: [], daily: [] } });
      }
      if (String(url).includes('/ai/history')) {
        return Promise.resolve({
          data: {
            items: [{
              id: 'msg-1',
              role: 'assistant',
              content: '已处理',
              createdAt: '2026-03-01T10:00:00.000Z',
              routePlan: { mode: 'cross-domain', selectedDomains: ['finance', 'inventory'] },
              selectedToolNames: ['SearchEntities', 'GetInventoryOverview'],
              toolTraceSummary: {
                totalCalls: 2,
                failureCount: 1,
                totalDurationMs: 30,
                items: [
                  { name: 'SearchEntities', domain: 'search', access: 'read', status: 'success', durationMs: 12 },
                  { name: 'GetInventoryOverview', domain: 'inventory', access: 'read', status: 'failed', durationMs: 18, error: 'timeout' },
                ],
              },
              actionRecommendations: [
                {
                  code: 'trade-compliance.prepare-forex-verification',
                  title: '推进收汇核销登记',
                  domain: 'trade-compliance',
                  priority: 'high',
                  executionMode: 'manual',
                  reason: '已有报关记录但尚未形成收汇核销记录',
                },
              ],
              pendingActionSummary: [
                {
                  actionId: 'pa-1',
                  actionType: 'CreateTaxRefundDraft',
                  description: '补建退税草稿：已具备退税前置条件',
                  status: 'executed',
                  createdAt: '2026-04-04T12:00:00.000Z',
                  resultDetail: '已创建退税草稿',
                  timeline: [
                    {
                      type: 'created',
                      status: 'pending',
                      detail: '补建退税草稿：已具备退税前置条件',
                      at: '2026-04-04T12:00:00.000Z',
                    },
                    {
                      type: 'executed',
                      status: 'executed',
                      detail: '已创建退税草稿',
                      at: '2026-04-04T12:05:00.000Z',
                    },
                  ],
                },
              ],
            }],
          },
        });
      }
      return Promise.resolve({ data: null });
    });
    mockDeleteSession.mockReset();
    mockToastError.mockReset();
    mockRouterReplace.mockReset();
    mockSearchParams = new URLSearchParams();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('加载后展示会话列表', async () => {
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_1',
          _count: { _all: 3 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
          routeMode: 'cross-domain',
          domainsTouched: ['finance', 'inventory'],
          toolTraceSummary: { totalCalls: 5, failureCount: 1, totalDurationMs: 87 },
          pendingActionSummary: [
            {
              actionId: 'pa-1',
              actionType: 'CreateTaxRefundDraft',
              description: '补建退税草稿',
              status: 'failed',
              createdAt: '2026-04-04T04:00:00.000Z',
              resultDetail: '报关单缺失',
              timeline: [
                {
                  type: 'created',
                  status: 'pending',
                  detail: '补建退税草稿',
                  at: '2026-04-04T04:00:00.000Z',
                },
                {
                  type: 'failed',
                  status: 'failed',
                  detail: '报关单缺失',
                  at: '2026-04-04T04:06:00.000Z',
                },
              ],
            },
            {
              actionId: 'pa-2',
              actionType: 'AllocatePayment',
              description: '确认收款挂账',
              status: 'executed',
              createdAt: '2026-04-04T04:01:00.000Z',
              timeline: [
                {
                  type: 'created',
                  status: 'pending',
                  detail: '确认收款挂账',
                  at: '2026-04-04T04:01:00.000Z',
                },
                {
                  type: 'executed',
                  status: 'executed',
                  detail: '已执行挂账',
                  at: '2026-04-04T04:05:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    });

    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'AI 会话列表' })).toBeInTheDocument();
      expect(screen.getAllByText('session_1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('cross-domain').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/finance \+1/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/5 \/ 失败 1/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/动作 2 · 已执行 1 · 失败 1/).length).toBeGreaterThan(0);
      expect(screen.getByText(/失败动作/)).toBeInTheDocument();
      expect(screen.getByText(/2026-04-04 12:06:00/)).toBeInTheDocument();
      expect(screen.getByText('Agent 工具注册表')).toBeInTheDocument();
      expect(screen.getByText('主入口 unified')).toBeInTheDocument();
      expect(screen.getByText('当前角色 FINANCE')).toBeInTheDocument();
      expect(screen.getByText('finance ×2 / 复合 1')).toBeInTheDocument();
      expect(screen.getByText('围绕应收、应付、回款、收款池与财务风险做事实查询和判断')).toBeInTheDocument();
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

  it('查看会话详情时展示工具调用明细回放', async () => {
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_1',
          _count: { _all: 3 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
          routeMode: 'cross-domain',
          domainsTouched: ['finance', 'inventory'],
          toolTraceSummary: { totalCalls: 2, failureCount: 1, totalDurationMs: 30 },
          pendingActionSummary: [
            {
              actionId: 'pa-1',
              actionType: 'CreateTaxRefundDraft',
              description: '补建退税草稿：已具备退税前置条件',
              status: 'executed',
              createdAt: '2026-04-04T12:00:00.000Z',
              resultDetail: '已创建退税草稿',
              timeline: [
                {
                  type: 'created',
                  status: 'pending',
                  detail: '补建退税草稿：已具备退税前置条件',
                  at: '2026-04-04T12:00:00.000Z',
                },
                {
                  type: 'executed',
                  status: 'executed',
                  detail: '已创建退税草稿',
                  at: '2026-04-04T12:05:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    });

    const user = userEvent.setup();
    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('session_1').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByLabelText('查看会话-session_1'));

    await waitFor(() => {
      expect(screen.getByText('工具调用明细')).toBeInTheDocument();
      expect(screen.getByText('推荐动作')).toBeInTheDocument();
      expect(screen.getByText('待确认动作')).toBeInTheDocument();
      expect(screen.getAllByText('executed').length).toBeGreaterThan(0);
      expect(screen.getByText('动作时间线')).toBeInTheDocument();
      expect(screen.getByText('created')).toBeInTheDocument();
      expect(screen.getByText('SearchEntities')).toBeInTheDocument();
      expect(screen.getByText('GetInventoryOverview')).toBeInTheDocument();
      expect(screen.getByText('timeout')).toBeInTheDocument();
      expect(screen.getByText('推进收汇核销登记')).toBeInTheDocument();
      expect(screen.getByText('已有报关记录但尚未形成收汇核销记录')).toBeInTheDocument();
      expect(screen.getAllByText('补建退税草稿：已具备退税前置条件').length).toBeGreaterThan(0);
      expect(screen.getAllByText('已创建退税草稿').length).toBeGreaterThan(0);
    });
  });

  it('会话列表按动作风险排序，并支持按动作状态筛选', async () => {
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_done',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T08:00:00.000Z' },
          routeMode: 'focused',
          domainsTouched: ['finance'],
          pendingActionSummary: [
            {
              actionId: 'pa-done',
              actionType: 'AllocatePayment',
              description: '确认收款挂账',
              status: 'executed',
              createdAt: '2026-04-04T04:01:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '确认收款挂账', at: '2026-04-04T04:01:00.000Z' },
                { type: 'executed', status: 'executed', detail: '已执行挂账', at: '2026-04-04T04:05:00.000Z' },
              ],
            },
          ],
        },
        {
          sessionId: 'session_pending',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T09:00:00.000Z' },
          routeMode: 'focused',
          domainsTouched: ['inventory'],
          pendingActionSummary: [
            {
              actionId: 'pa-pending',
              actionType: 'UpdateInventoryStatus',
              description: '更新库存状态',
              status: 'pending',
              createdAt: '2026-04-04T04:07:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '更新库存状态', at: '2026-04-04T04:07:00.000Z' },
              ],
            },
          ],
        },
        {
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
          routeMode: 'cross-domain',
          domainsTouched: ['trade-compliance'],
          pendingActionSummary: [
            {
              actionId: 'pa-failed',
              actionType: 'CreateTaxRefundDraft',
              description: '补建退税草稿',
              status: 'failed',
              createdAt: '2026-04-04T04:00:00.000Z',
              resultDetail: '报关单缺失',
              timeline: [
                { type: 'created', status: 'pending', detail: '补建退税草稿', at: '2026-04-04T04:00:00.000Z' },
                { type: 'failed', status: 'failed', detail: '报关单缺失', at: '2026-04-04T04:06:00.000Z' },
              ],
            },
          ],
        },
      ],
    });

    const user = userEvent.setup();
    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows[0]?.textContent).toContain('session_failed');
      expect(rows[1]?.textContent).toContain('session_pending');
      expect(rows[2]?.textContent).toContain('session_done');
    });

    await user.click(screen.getByLabelText('排序方式'));
    await user.click(screen.getByRole('option', { name: '最近动作' }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows[0]?.textContent).toContain('session_pending');
      expect(rows[1]?.textContent).toContain('session_failed');
      expect(rows[2]?.textContent).toContain('session_done');
    });

    await user.click(screen.getByLabelText('动作筛选'));
    await user.click(screen.getByRole('option', { name: '有失败' }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_failed');
    });
  });

  it('从 URL 恢复排序和筛选状态，并在切换时回写 query', async () => {
    mockSearchParams = new URLSearchParams('sort=latest-action&actionFilter=pending');
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_done',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T08:00:00.000Z' },
          pendingActionSummary: [
            {
              actionId: 'pa-done',
              actionType: 'AllocatePayment',
              description: '确认收款挂账',
              status: 'executed',
              createdAt: '2026-04-04T04:01:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '确认收款挂账', at: '2026-04-04T04:01:00.000Z' },
                { type: 'executed', status: 'executed', detail: '已执行挂账', at: '2026-04-04T04:05:00.000Z' },
              ],
            },
          ],
        },
        {
          sessionId: 'session_pending',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T09:00:00.000Z' },
          pendingActionSummary: [
            {
              actionId: 'pa-pending',
              actionType: 'UpdateInventoryStatus',
              description: '更新库存状态',
              status: 'pending',
              createdAt: '2026-04-04T04:07:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '更新库存状态', at: '2026-04-04T04:07:00.000Z' },
              ],
            },
          ],
        },
      ],
    });

    const user = userEvent.setup();
    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_pending');
    });

    await user.click(screen.getByLabelText('动作筛选'));
    await user.click(screen.getByRole('option', { name: '全部' }));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
      const lastCall = mockRouterReplace.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('/dashboard/ai/sessions?');
      expect(lastCall).toContain('sort=latest-action');
      expect(lastCall).not.toContain('actionFilter=pending');
    });
  });
});
