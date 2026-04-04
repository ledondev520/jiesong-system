/**
 * Input: AI 会话页面、aiService、toast
 * Output: AI 会话页面交互测试
 * Pos: 前端业务页测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    window.localStorage.clear();
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
      expect(screen.getAllByText(/失败动作/).length).toBeGreaterThan(0);
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
    mockSearchParams = new URLSearchParams('sort=risk&actionFilter=all');
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
              createdAt: '2020-04-04T04:01:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '确认收款挂账', at: '2020-04-04T04:01:00.000Z' },
                { type: 'executed', status: 'executed', detail: '已执行挂账', at: '2020-04-04T04:05:00.000Z' },
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
              createdAt: '2020-04-04T04:07:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '更新库存状态', at: '2020-04-04T04:07:00.000Z' },
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
              createdAt: '2020-04-04T04:00:00.000Z',
              resultDetail: '报关单缺失',
              timeline: [
                { type: 'created', status: 'pending', detail: '补建退税草稿', at: '2020-04-04T04:00:00.000Z' },
                { type: 'failed', status: 'failed', detail: '报关单缺失', at: '2020-04-04T04:06:00.000Z' },
              ],
            },
          ],
        },
      ],
    });

    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows[0]?.textContent).toContain('session_failed');
      expect(rows[1]?.textContent).toContain('session_pending');
      expect(rows[2]?.textContent).toContain('session_done');
      expect(screen.getByText('当前：超时优先风险排序')).toBeInTheDocument();
      expect(screen.getByTestId('sessions-governance-summary')).toHaveTextContent('当前有 1 个失败动作会话需要优先处理');
      expect(screen.getByTestId('sessions-governance-summary')).toHaveTextContent('其中 1 个失败动作已超过 4 小时未处理');
      expect(screen.getByText('超时失败 1')).toBeInTheDocument();
      expect(screen.getByText('超时待确认 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '处理失败动作' })).toBeInTheDocument();
      expect(screen.getAllByText('SLA P1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('SLA P2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('SLA P3').length).toBeGreaterThan(0);
      expect(screen.getAllByText('需立即处理').length).toBeGreaterThan(0);
      expect(screen.getAllByText('待人工确认').length).toBeGreaterThan(0);
      expect(screen.getAllByText('已闭环').length).toBeGreaterThan(0);
    });

    const user = userEvent.setup();

    await user.click(screen.getByLabelText('排序方式'));
    await user.click(screen.getByRole('option', { name: '最近动作' }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows[0]?.textContent).toContain('session_pending');
      expect(rows[1]?.textContent).toContain('session_failed');
      expect(rows[2]?.textContent).toContain('session_done');
      expect(screen.queryByText('当前：超时优先风险排序')).not.toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('动作筛选'));
    await user.click(screen.getByRole('option', { name: '有失败' }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_failed');
    });
  });

  it('风险排序会优先显示超时会话，再按失败/待确认分层', async () => {
    mockSearchParams = new URLSearchParams('sort=risk&actionFilter=all');
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_failed_recent',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T11:00:00.000Z' },
          pendingActionSummary: [
            {
              actionId: 'pa-failed-recent',
              actionType: 'CreateTaxRefundDraft',
              description: '补建退税草稿',
              status: 'failed',
              createdAt: '2026-04-04T04:00:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '补建退税草稿', at: '2026-04-04T04:00:00.000Z' },
                { type: 'failed', status: 'failed', detail: '报关单缺失', at: '2026-04-04T04:06:00.000Z' },
              ],
            },
          ],
        },
        {
          sessionId: 'session_pending_stale',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
          pendingActionSummary: [
            {
              actionId: 'pa-pending-stale',
              actionType: 'UpdateInventoryStatus',
              description: '更新库存状态',
              status: 'pending',
              createdAt: '2020-04-04T04:07:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '更新库存状态', at: '2020-04-04T04:07:00.000Z' },
              ],
            },
          ],
        },
        {
          sessionId: 'session_failed_stale',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T09:00:00.000Z' },
          pendingActionSummary: [
            {
              actionId: 'pa-failed-stale',
              actionType: 'CreateTaxRefundDraft',
              description: '补建退税草稿',
              status: 'failed',
              createdAt: '2020-04-04T04:00:00.000Z',
              timeline: [
                { type: 'created', status: 'pending', detail: '补建退税草稿', at: '2020-04-04T04:00:00.000Z' },
                { type: 'failed', status: 'failed', detail: '报关单缺失', at: '2020-04-04T04:06:00.000Z' },
              ],
            },
          ],
        },
      ],
    });

    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows[0]?.textContent).toContain('session_failed_stale');
      expect(rows[1]?.textContent).toContain('session_pending_stale');
      expect(rows[2]?.textContent).toContain('session_failed_recent');
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
      expect(screen.getByText('来源：URL 参数')).toBeInTheDocument();
      expect(screen.getByText('链接参数优先于本地偏好和默认视图。')).toBeInTheDocument();
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

  it('无 URL 参数时从 localStorage 恢复排序和筛选偏好', async () => {
    window.localStorage.setItem('ai-sessions-list-preferences', JSON.stringify({
      sort: 'latest-action',
      actionFilter: 'pending',
    }));

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

    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_pending');
      expect(screen.getByText('来源：本地偏好')).toBeInTheDocument();
      expect(screen.getByText('已恢复你上次保存的治理视角。')).toBeInTheDocument();
    });
  });

  it('无 URL、无本地偏好、无失败动作时显示默认视图来源', async () => {
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
      ],
    });

    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_done');
      expect(screen.getByText('来源：默认视图')).toBeInTheDocument();
      expect(screen.getByText('当前使用系统默认的全量风险视图。')).toBeInTheDocument();
    });
  });

  it('无 URL 参数且存在失败动作时，默认落到风险优先 + 有失败视角', async () => {
    window.localStorage.setItem('ai-sessions-list-preferences', JSON.stringify({
      sort: 'latest-message',
      actionFilter: 'completed',
    }));

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
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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

    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_failed');
      expect(screen.getByText('来源：自动失败视角')).toBeInTheDocument();
      expect(screen.getByText('检测到失败动作，系统临时切到失败优先视角。')).toBeInTheDocument();
    });
  });

  it('自动失败视角不应自动写回 URL 参数', async () => {
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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

    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_failed');
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('自动失败视角下，手动切回全部后应保持全部视角', async () => {
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
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_failed');
    });

    await user.click(screen.getByRole('button', { name: /全部 2/ }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(2);
      expect(rows[0]?.textContent).toContain('session_failed');
      expect(rows[1]?.textContent).toContain('session_done');
      expect(screen.getByText('来源：手动调整')).toBeInTheDocument();
    });
  });

  it('自动失败视角不应污染已有本地偏好', async () => {
    window.localStorage.setItem('ai-sessions-list-preferences', JSON.stringify({
      sort: 'latest-message',
      actionFilter: 'completed',
    }));

    mockGetSessions
      .mockResolvedValueOnce({
        data: [
          {
            sessionId: 'session_failed',
            _count: { _all: 1 },
            _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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
        ],
      })
      .mockResolvedValueOnce({
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
        ],
      });

    const firstRender = render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_failed');
    });

    firstRender.unmount();

    const secondRender = render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_done');
    });

    secondRender.unmount();
  });

  it('顶部待处理 chips 会展示数量并能一键切换过滤视角', async () => {
    mockSearchParams = new URLSearchParams('sort=risk&actionFilter=all');
    mockGetSessions.mockResolvedValue({
      data: [
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
        {
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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
      ],
    });

    const user = userEvent.setup();
    render(<AiSessionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /失败动作 1/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /待确认 1/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /待处理 2/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /待处理 2/ }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(2);
      expect(rows[0]?.textContent).toContain('session_pending');
      expect(rows[1]?.textContent).toContain('session_failed');
    });
  });

  it('顶部 chips 会联动治理预设排序与筛选', async () => {
    mockSearchParams = new URLSearchParams('sort=risk&actionFilter=all');
    mockGetSessions.mockResolvedValue({
      data: [
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
        {
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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
      expect(screen.getByRole('button', { name: /待确认 1/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /待确认 1/ }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_pending');
      const lastCall = mockRouterReplace.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('sort=latest-action');
      expect(lastCall).toContain('actionFilter=pending');
    });
  });

  it('顶部全部 chip 会恢复默认治理视角', async () => {
    mockSearchParams = new URLSearchParams('sort=latest-action&actionFilter=pending');
    mockGetSessions.mockResolvedValue({
      data: [
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
      ],
    });

    const user = userEvent.setup();
    render(<AiSessionsPage />);

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('session_pending');
    });

    await user.click(screen.getByRole('button', { name: /全部 2/ }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      expect(rows).toHaveLength(2);
      expect(rows[0]?.textContent).toContain('session_pending');
      expect(rows[1]?.textContent).toContain('session_done');
      const lastCall = mockRouterReplace.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain('sort=latest-action');
      expect(lastCall).not.toContain('actionFilter=pending');
    });
  });

  it('治理预设入口条会以 sticky bar 形式展示，并高亮当前激活视角', async () => {
    mockSearchParams = new URLSearchParams('sort=risk&actionFilter=failed');
    mockGetSessions.mockResolvedValue({
      data: [
        {
          sessionId: 'session_failed',
          _count: { _all: 1 },
          _max: { createdAt: '2026-03-01T10:00:00.000Z' },
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

    render(<AiSessionsPage />);

    await waitFor(() => {
      const bar = screen.getByTestId('governance-presets');
      expect(bar.className).toContain('sticky');
      expect(bar.className).toContain('top-0');
      expect(screen.getByRole('button', { name: /失败动作 1/ }).getAttribute('data-variant')).toBe('default');
      expect(screen.getByRole('button', { name: /全部 1/ }).getAttribute('data-variant')).toBe('outline');
    });
  });
});
