import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchImportDialog } from './BatchImportDialog';

vi.mock('@/services/hsCode.service', () => ({
  hsCodeService: {
    batchMatch: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('BatchImportDialog', () => {
  it('为粘贴与上传模式的输入字段提供可关联标签', async () => {
    const user = userEvent.setup();

    render(
      <BatchImportDialog
        open
        onOpenChange={vi.fn()}
        onImportComplete={vi.fn()}
      />
    );

    expect(screen.getByLabelText('商品名称列表（每行一个）')).toHaveAttribute('name', 'batchProductNames');

    await user.click(screen.getByRole('button', { name: '上传文件' }));

    expect(screen.getByLabelText('上传 Excel/CSV 文件')).toHaveAttribute('name', 'batchImportFile');
  });
});
