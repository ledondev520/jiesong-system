/**
 * Input: 模板管理页面、contractDocService、router、toast
 * Output: 模板管理页面交互测试
 * Pos: 前端业务页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractTemplatesPage from './page';

const mockPush = vi.fn();
const mockGetTemplates = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), back: vi.fn() }),
}));

vi.mock('@/services/contractDoc.service', () => ({
  contractDocService: {
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('ContractTemplatesPage', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetTemplates.mockReset();
    mockDeleteTemplate.mockReset();
    mockToastError.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('展示当前模板记录', async () => {
    mockGetTemplates.mockResolvedValue({
      data: {
        items: [{ exists: true, filename: '购销合同模板.docx', size: 1024, updatedAt: '2026-03-01T10:00:00.000Z' }],
      },
    });

    render(<ContractTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '模板管理' })).toBeInTheDocument();
      expect(screen.getByText('购销合同模板.docx')).toBeInTheDocument();
    });
  });

  it('点击去上传模板会跳转', async () => {
    mockGetTemplates.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();

    render(<ContractTemplatesPage />);

    await user.click(await screen.findByRole('button', { name: '去上传模板' }));

    expect(mockPush).toHaveBeenCalledWith('/dashboard/contracts/template');
  });

  it('加载失败时提示错误', async () => {
    mockGetTemplates.mockRejectedValue(new Error('failed'));

    render(<ContractTemplatesPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载模板列表失败');
    });
  });
});
