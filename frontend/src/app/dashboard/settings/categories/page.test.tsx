/**
 * Input: 分类设置页面、system service、toast
 * Output: 分类配置页面交互测试结果
 * Pos: 前端设置页面测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoriesSettingsPage from './page';

const mockGetSystemCategories = vi.fn();
const mockCreateSystemCategory = vi.fn();
const mockUpdateSystemCategory = vi.fn();
const mockDeleteSystemCategory = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/system.service', () => ({
  getSystemCategories: (...args: unknown[]) => mockGetSystemCategories(...args),
  createSystemCategory: (...args: unknown[]) => mockCreateSystemCategory(...args),
  updateSystemCategory: (...args: unknown[]) => mockUpdateSystemCategory(...args),
  deleteSystemCategory: (...args: unknown[]) => mockDeleteSystemCategory(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('CategoriesSettingsPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetSystemCategories.mockReset();
    mockCreateSystemCategory.mockReset();
    mockUpdateSystemCategory.mockReset();
    mockDeleteSystemCategory.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();

    mockGetSystemCategories.mockResolvedValue({
      data: {
        items: [
          {
            id: 'cat-1',
            name: '瓷砖',
            parentId: null,
            _count: { children: 1, products: 3 },
          },
        ],
      },
    });
  });

  it('加载后展示分类列表', async () => {
    render(<CategoriesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '商品分类配置' })).toBeInTheDocument();
      expect(screen.getByText('瓷砖')).toBeInTheDocument();
      expect(screen.getByText('维护商品分类层级，支持父子分类关系')).toBeInTheDocument();
    });
  });

  it('可新增分类并调用创建接口', async () => {
    mockCreateSystemCategory.mockResolvedValue({});
    const user = userEvent.setup();

    render(<CategoriesSettingsPage />);

    await user.click(await screen.findByRole('button', { name: '新增分类' }));
    await user.type(screen.getByLabelText('分类名称'), '地砖');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockCreateSystemCategory).toHaveBeenCalledWith({
        name: '地砖',
        parentId: null,
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('分类创建成功');
    });
  });
});
