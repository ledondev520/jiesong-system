/**
 * Input: 月度会计报表上传弹窗
 * Output: 两 Sheet 要求与非误导性文案
 * Pos: 财务报表上传交互测试
 */

import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinancialStatementsUploadDialog } from './FinancialStatementsUploadDialog';

describe('FinancialStatementsUploadDialog', () => {
  it('按真实要求称为月度会计报表而不是三表', () => {
    render(
      <FinancialStatementsUploadDialog
        open
        uploadFile={null}
        uploadMonth="7"
        uploadYear="2026"
        uploading={false}
        fileInputRef={createRef<HTMLInputElement>()}
        onClearFile={vi.fn()}
        onMonthChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onUploadFileChange={vi.fn()}
        onYearChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '上传月度会计报表 Excel' })).toBeInTheDocument();
    expect(screen.getByText(/资产负债表.*利润表.*两个 Sheet/)).toBeInTheDocument();
    expect(screen.queryByText(/三表/)).not.toBeInTheDocument();
  });
});
