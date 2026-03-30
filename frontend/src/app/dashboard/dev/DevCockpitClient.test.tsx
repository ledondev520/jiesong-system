import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DevCockpitClient } from './DevCockpitClient';

const snapshot = {
  generatedAt: new Date('2026-03-30T10:00:00.000Z').toISOString(),
  repoRoot: '/Users/helena/Cursor/jiesong_system',
  branch: 'main',
  head: 'abc1234',
  dirty: true,
  statusLines: ['M frontend/src/components/layout/Header.tsx'],
  changedFiles: [{ status: 'M', path: 'frontend/src/components/layout/Header.tsx' }],
  diffStatLines: ['frontend/src/components/layout/Header.tsx | 12 +++---'],
  taskRows: [],
  openTasks: [{ id: 'COCKPIT-01', priority: 'P0', estimated: '90m', slots: '1', status: 'DOING', task: '落地本地项目驾驶舱' }],
  taskDoneCount: 2,
  taskTodoCount: 1,
  planExcerpt: { title: '2026-03-29 Round 73（系统管理“关于”模块：Agent 快速接入说明）', lines: ['## 2026-03-29 Round 73 ...'] },
  metricsExcerpt: { title: '2026-03-29 Round 64（表单字段 id/name 统一排查修复）', lines: ['## 2026-03-29 Round 64 ...'] },
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/dev',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('DevCockpitClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('渲染本地状态并显示变更和待办', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 })) as typeof fetch);

    render(<DevCockpitClient initialSnapshot={snapshot} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '项目驾驶舱' })).toBeInTheDocument();
    });

    expect(screen.getByText('打开方式')).toBeInTheDocument();
    expect(screen.getByText('工作树已变更')).toBeInTheDocument();
    expect(screen.getByText('frontend/src/components/layout/Header.tsx')).toBeInTheDocument();
    expect(screen.getByText('COCKPIT-01')).toBeInTheDocument();
    expect(screen.getByText('打开接入说明')).toBeInTheDocument();
  });
});
