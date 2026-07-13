/**
 * Input: 财务数据包上传弹窗
 * Output: 三类来源要求、预览摘要与覆盖确认
 * Pos: 财务报表上传交互测试
 */

import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinancialStatementsUploadDialog } from './FinancialStatementsUploadDialog';

const refs = () => ({
  statement: createRef<HTMLInputElement>(),
  trialBalance: createRef<HTMLInputElement>(),
  generalLedger: createRef<HTMLInputElement>(),
});

const baseProps = {
  open: true,
  uploadMonth: '7',
  uploadYear: '2026',
  previewing: false,
  confirming: false,
  overwriteConfirmed: false,
  onClearFiles: vi.fn(),
  onConfirm: vi.fn(),
  onMonthChange: vi.fn(),
  onOpenChange: vi.fn(),
  onOverwriteConfirmedChange: vi.fn(),
  onPreview: vi.fn(),
  onUploadFileChange: vi.fn(),
  onYearChange: vi.fn(),
};

describe('FinancialStatementsUploadDialog', () => {
  it('明确要求会计报表、科目余额表和明细账三份来源', () => {
    render(
      <FinancialStatementsUploadDialog
        {...baseProps}
        uploadFiles={{ statement: null, trialBalance: null, generalLedger: null }}
        preview={null}
        fileInputRefs={refs()}
      />,
    );

    expect(screen.getByRole('heading', { name: '导入账期财务数据' })).toBeInTheDocument();
    expect(screen.getByLabelText('会计报表（.xlsx）')).toBeInTheDocument();
    expect(screen.getByLabelText('科目余额表（.xls / .xlsx）')).toBeInTheDocument();
    expect(screen.getByLabelText('明细账（.xlsx）')).toBeInTheDocument();
    expect(screen.getByText(/会计报表.*科目余额表.*明细账/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解析三份文件' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '确认写入账期' })).not.toBeInTheDocument();
  });

  it('预览已有账期时展示三类行数并必须明确确认覆盖', () => {
    render(
      <FinancialStatementsUploadDialog
        {...baseProps}
        uploadFiles={{
          statement: new File(['statement'], '会计报表.xlsx'),
          trialBalance: new File(['trial'], '科目余额.xls'),
          generalLedger: new File(['ledger'], '明细账.xlsx'),
        }}
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
            cashFlowFieldCount: 8,
            accountBalanceRowCount: 93,
            generalLedgerRowCount: 585,
            sourceFileCount: 3,
            trialBalanceChecks: { periodDifference: 0, endingDifference: 0 },
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
          cashFlowStatement: null,
          sources: [],
        }}
        fileInputRefs={refs()}
      />,
    );

    expect(screen.getByText('三文件解析预览')).toBeInTheDocument();
    expect(screen.getByText('CNY 1,000.00')).toBeInTheDocument();
    expect(screen.getByText('CNY 800.00')).toBeInTheDocument();
    expect(screen.getByText('科目余额 93 行')).toBeInTheDocument();
    expect(screen.getByText('明细账 585 行')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /确认覆盖 2026年7账期/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '确认写入账期' })).toBeDisabled();
  });
});
