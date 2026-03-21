/**
 * Input: 导入记录页面、system.service、toast
 * Output: 导入记录页交互测试
 * Pos: 运维模块
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemImportRecordsPage from './page';
import { Role } from '@/types';

const mockGetSystemImportRecords = vi.fn();
const mockToastError = vi.fn();
const mockUser = {
  role: Role.ADMIN,
};

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser | null }) => unknown) => selector({
    user: mockUser,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/dashboard/system/import-records',
}));

vi.mock('@/services/system.service', () => ({
  getSystemImportRecords: (...args: unknown[]) => mockGetSystemImportRecords(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

const firstRecord = {
  id: 'r1',
  fileName: '2026-03-import.csv',
  totalRows: 100,
  successRows: 98,
  failedRows: 2,
  status: 'COMPLETED',
  errorLog: '[{"row":2,"error":"字段缺失"}]',
  importedAt: '2026-03-01T10:00:00.000Z',
  importedBy: 'admin',
};

const secondRecord = {
  ...firstRecord,
  id: 'r2',
  fileName: '2026-02-import.csv',
  status: 'FAILED',
  successRows: 40,
  failedRows: 60,
  importedAt: '2026-02-28T10:00:00.000Z',
};

describe('SystemImportRecordsPage', () => {
  beforeEach(() => {
    mockUser.role = Role.ADMIN;
    mockGetSystemImportRecords.mockReset();
    mockToastError.mockReset();
  });

  it('渲染导入记录列表', async () => {
    mockGetSystemImportRecords.mockResolvedValue({
      data: {
        items: [firstRecord],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      },
    });

    render(<SystemImportRecordsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '导入记录' })).toBeInTheDocument();
      expect(screen.getByText('2026-03-import.csv')).toBeInTheDocument();
      expect(screen.getByText('98')).toBeInTheDocument();
    });

    expect(mockGetSystemImportRecords).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: undefined,
      keyword: undefined,
    });
  });

  it('支持状态筛选、关键词筛选与翻页', async () => {
    mockGetSystemImportRecords.mockImplementation(async ({ page = 1 }: { page?: number }) => ({
      data: {
        items: page === 2 ? [secondRecord] : [firstRecord],
        pagination: {
          total: 2,
          page,
          pageSize: 20,
          totalPages: 2,
        },
      },
    }));

    const user = userEvent.setup();
    render(<SystemImportRecordsPage />);

    await waitFor(() => {
      expect(screen.getByText('2026-03-import.csv')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '已完成' }));

    await waitFor(() => {
      expect(mockGetSystemImportRecords).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        status: 'COMPLETED',
        keyword: undefined,
      });
    });

    await user.type(screen.getByPlaceholderText('按文件名筛选'), 'march');
    await user.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(mockGetSystemImportRecords).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        status: 'COMPLETED',
        keyword: 'march',
      });
    });

    await user.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(mockGetSystemImportRecords).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 20,
        status: 'COMPLETED',
        keyword: 'march',
      });
    });
  });

  it('非管理员角色不请求数据并显示无权限提示', async () => {
    mockUser.role = Role.SALES;
    render(<SystemImportRecordsPage />);

    await waitFor(() => {
      expect(screen.getByText('无权限访问')).toBeInTheDocument();
    });

    expect(screen.getByText('当前账号角色无权查看导入记录。')).toBeInTheDocument();
    expect(mockGetSystemImportRecords).not.toHaveBeenCalled();
  });

  it('请求失败时展示错误提示', async () => {
    mockGetSystemImportRecords.mockRejectedValue(new Error('network error'));
    render(<SystemImportRecordsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载导入记录失败');
    });
  });
});
