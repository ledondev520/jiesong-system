/**
 * Input: 港口设置页面、system service、toast
 * Output: 港口配置页面交互测试结果
 * Pos: 前端设置页面测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortsSettingsPage from './page';

const mockGetSystemPorts = vi.fn();
const mockCreateSystemPort = vi.fn();
const mockUpdateSystemPort = vi.fn();
const mockDeleteSystemPort = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/system.service', () => ({
  getSystemPorts: (...args: unknown[]) => mockGetSystemPorts(...args),
  createSystemPort: (...args: unknown[]) => mockCreateSystemPort(...args),
  updateSystemPort: (...args: unknown[]) => mockUpdateSystemPort(...args),
  deleteSystemPort: (...args: unknown[]) => mockDeleteSystemPort(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('PortsSettingsPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetSystemPorts.mockReset();
    mockCreateSystemPort.mockReset();
    mockUpdateSystemPort.mockReset();
    mockDeleteSystemPort.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();

    mockGetSystemPorts.mockResolvedValue({
      data: {
        items: [
          {
            id: 'port-1',
            name: 'Los Angeles',
            code: 'LA',
            isActive: true,
            updatedAt: '2026-03-01T09:00:00.000Z',
          },
        ],
      },
    });
  });

  it('加载后展示港口列表', async () => {
    render(<PortsSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '港口配置' })).toBeInTheDocument();
      expect(screen.getByText('Los Angeles')).toBeInTheDocument();
      expect(screen.getByText('LA')).toBeInTheDocument();
    });
  });

  it('可新增港口并自动转为大写代码', async () => {
    mockCreateSystemPort.mockResolvedValue({});
    const user = userEvent.setup();

    render(<PortsSettingsPage />);

    await user.click(await screen.findByRole('button', { name: '新增港口' }));
    await user.type(screen.getByLabelText('港口名称'), 'Oakland');
    await user.type(screen.getByLabelText('港口代码'), 'oak');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mockCreateSystemPort).toHaveBeenCalledWith({
        name: 'Oakland',
        code: 'OAK',
        isActive: true,
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('港口创建成功');
    });
  });
});
