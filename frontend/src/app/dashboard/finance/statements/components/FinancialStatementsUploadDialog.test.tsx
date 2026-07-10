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
        preview={null}
        previewing={false}
        confirming={false}
        overwriteConfirmed={false}
        fileInputRef={createRef<HTMLInputElement>()}
        onClearFile={vi.fn()}
        onConfirm={vi.fn()}
        onMonthChange={vi.fn()}
        onOpenChange={vi.fn()}
        onOverwriteConfirmedChange={vi.fn()}
        onPreview={vi.fn()}
        onUploadFileChange={vi.fn()}
        onYearChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '上传月度会计报表 Excel' })).toBeInTheDocument();
    expect(screen.getByText(/资产负债表.*利润表.*两个 Sheet/)).toBeInTheDocument();
    expect(screen.queryByText(/三表/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解析并预览' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认写入账期' })).not.toBeInTheDocument();
  });

  it('预览已有账期时必须勾选覆盖确认后才能写入', () => {
    render(
      <FinancialStatementsUploadDialog
        open
        uploadFile={new File(['content'], '2026-07.xlsx')}
        uploadMonth="7"
        uploadYear="2026"
        preview={{
          previewId: 'preview-1',
          ready: true,
          period: {
            year: 2026,
            month: 7,
            periodLabel: '2026年7账期',
            reportDate: '2026-07-31',
            existing: true,
          },
          summary: {
            balanceSheetFieldCount: 4,
            incomeStatementFieldCount: 6,
            totalAssets: 1000,
            totalLiabilities: 400,
            totalEquity: 600,
            accountingEquationDifference: 0,
            revenueMonth: 800,
            costOfSalesMonth: 500,
            netProfitMonth: 120,
            costStructure: {
              costOfSales: 500,
              taxes: 0,
              sellingExpenses: 0,
              adminExpenses: 0,
              financialExpenses: 0,
              total: 500,
            },
          },
          blockers: [],
          warnings: ['该账期已存在，确认后将覆盖更新'],
        }}
        previewing={false}
        confirming={false}
        overwriteConfirmed={false}
        fileInputRef={createRef<HTMLInputElement>()}
        onClearFile={vi.fn()}
        onConfirm={vi.fn()}
        onMonthChange={vi.fn()}
        onOpenChange={vi.fn()}
        onOverwriteConfirmedChange={vi.fn()}
        onPreview={vi.fn()}
        onUploadFileChange={vi.fn()}
        onYearChange={vi.fn()}
      />,
    );

    expect(screen.getByText('解析预览')).toBeInTheDocument();
    expect(screen.getByText('CNY 1,000.00')).toBeInTheDocument();
    expect(screen.getByText('CNY 800.00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /确认覆盖 2026年7账期/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '确认写入账期' })).toBeDisabled();
  });
});
