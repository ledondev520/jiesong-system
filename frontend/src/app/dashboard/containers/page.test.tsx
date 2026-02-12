/**
 * Input: 货柜列表页面、containerService、ContainerDialog、toast
 * Output: 货柜列表页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import ContainersPage from './page';

const mockGetAll = vi.fn();
const mockDelete = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/services/container.service', () => ({
  containerService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('./components/ContainerDialog', () => ({
  ContainerDialog: ({ open }: { open: boolean }) => (open ? <div>货柜弹窗已打开</div> : null),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('ContainersPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockDelete.mockReset();
    mockToastError.mockReset();
  });

  it('加载后展示空态', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<ContainersPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '货柜管理' })).toBeInTheDocument();
      expect(screen.getByText('暂无货柜数据。')).toBeInTheDocument();
    });
  });

  it('点击创建货柜会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ContainersPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /创建货柜/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /创建货柜/ }));

    expect(screen.getByText('货柜弹窗已打开')).toBeInTheDocument();
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<ContainersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载货柜失败');
    });
  });
});

