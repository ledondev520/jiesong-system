/**
 * Input: 模板上传页面、contractDocService、toast
 * Output: 模板上传页面交互测试
 * Pos: 前端业务页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractTemplateUploadPage from './page';

const mockCheckTemplate = vi.fn();
const mockGetTemplates = vi.fn();
const mockUploadTemplate = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/services/contractDoc.service', () => ({
  contractDocService: {
    checkTemplate: (...args: unknown[]) => mockCheckTemplate(...args),
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    uploadTemplate: (...args: unknown[]) => mockUploadTemplate(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

describe('ContractTemplateUploadPage', () => {
  beforeEach(() => {
    mockCheckTemplate.mockReset();
    mockGetTemplates.mockReset();
    mockUploadTemplate.mockReset();
    mockToastError.mockReset();

    mockCheckTemplate.mockResolvedValue({ data: { exists: false } });
    mockGetTemplates.mockResolvedValue({ data: { items: [] } });
  });

  it('加载后展示模板状态', async () => {
    render(<ContractTemplateUploadPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '模板上传' })).toBeInTheDocument();
      expect(screen.getByText('当前尚未上传模板。')).toBeInTheDocument();
    });
  });

  it('选择并上传模板文件', async () => {
    mockUploadTemplate.mockResolvedValue({});
    const user = userEvent.setup();

    render(<ContractTemplateUploadPage />);

    const fileInput = await screen.findByLabelText('', { selector: 'input[type="file"]' });
    const file = new File(['demo'], 'contract.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    await user.upload(fileInput, file);
    await user.click(screen.getByRole('button', { name: '上传模板' }));

    expect(mockUploadTemplate).toHaveBeenCalled();
  });

  it('加载失败时提示错误', async () => {
    mockCheckTemplate.mockRejectedValue(new Error('failed'));

    render(<ContractTemplateUploadPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载模板状态失败');
    });
  });
});
