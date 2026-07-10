/**
 * Input: 合同附件列表、附件分类与上传 Interface
 * Output: 系统生成件/盖章件分类展示和分类上传测试
 * Pos: 合同版本与业务凭证归档 Module 测试
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractFiles from './ContractFiles';

const mockUpload = vi.fn();

vi.mock('@/services/contractFile.service', () => ({
  uploadContractFile: (...args: unknown[]) => mockUpload(...args),
  deleteContractFile: vi.fn(),
  getContractFileDownloadUrl: (id: string) => `/files/${id}`,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('ContractFiles', () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  it('区分系统生成 PDF 与供应商盖章回传件', () => {
    render(
      <ContractFiles
        contractId="pc-1"
        contractType="PURCHASE"
        files={[
          {
            id: 'f-1', fileName: '系统合同.pdf', filePath: 'a', fileType: 'application/pdf',
            mimeType: 'application/pdf', fileSize: 100, uploadedAt: '2026-07-10', category: 'SYSTEM_GENERATED_PDF',
          },
          {
            id: 'f-2', fileName: '盖章件.pdf', filePath: 'b', fileType: 'application/pdf',
            mimeType: 'application/pdf', fileSize: 100, uploadedAt: '2026-07-10', category: 'SIGNED_CONTRACT',
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('系统生成 PDF')).toBeInTheDocument();
    expect(screen.getByText('供应商盖章件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '预览系统合同.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载系统合同.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除系统合同.pdf' })).toBeInTheDocument();
  });

  it('采购附件默认按供应商盖章件上传而不是无分类文件', async () => {
    const uploaded = {
      id: 'f-3', fileName: 'signed.pdf', filePath: 'c', fileType: 'application/pdf',
      mimeType: 'application/pdf', fileSize: 100, uploadedAt: '2026-07-10', category: 'SIGNED_CONTRACT',
    };
    mockUpload.mockResolvedValue({ data: uploaded });

    render(
      <ContractFiles
        contractId="pc-1"
        contractType="PURCHASE"
        files={[]}
        onChange={vi.fn()}
        categoryOptions={[
          { value: 'SIGNED_CONTRACT', label: '供应商盖章件' },
          { value: 'PRODUCTION_PHOTO', label: '生产实物图' },
        ]}
      />,
    );

    const file = new File(['%PDF'], 'signed.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('上传合同附件'), { target: { files: [file] } });

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith('pc-1', 'PURCHASE', file, undefined, 'SIGNED_CONTRACT');
    });
  });
});
