/**
 * Input: 系统管理旧路由页面、router
 * Output: 旧路由跳转测试
 * Pos: 运维模块
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemManagementPage from './page';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

describe('SystemManagementPage', () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it('加载后自动跳转到设置页运维中心', () => {
    render(<SystemManagementPage />);
    expect(screen.getByText('正在跳转到运维中心...')).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/dashboard/settings?tab=ops');
  });
});
