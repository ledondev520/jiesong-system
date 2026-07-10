/**
 * Input: 财务报表页状态编排、预览/确认服务与上传对话框 mock
 * Output: 文件不能绕过预览直接写入的主线路交互测试
 * Pos: 月度会计报表独立页编排测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinancialStatementsPageContent } from './FinancialStatementsPageContent';

const mockGetAnalytics = vi.fn();
const mockListStatements = vi.fn();
const mockPreviewFile = vi.fn();
const mockConfirmFile = vi.fn();

vi.mock('@/components/layout/ModuleTabHeader', () => ({
  FINANCE_TABS: [],
  ModuleTabHeader: () => <div>财务导航</div>,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/services/financialStatements.service', () => ({
  financialStatementsService: {
    getAnalytics: (...args: unknown[]) => mockGetAnalytics(...args),
    listStatements: (...args: unknown[]) => mockListStatements(...args),
    getStatementDetail: vi.fn(),
    previewFile: (...args: unknown[]) => mockPreviewFile(...args),
    confirmFile: (...args: unknown[]) => mockConfirmFile(...args),
  },
}));

vi.mock('./FinancialStatementsOverview', () => ({
  FinancialStatementsLoadingState: () => <div>报表加载中</div>,
  FinancialStatementsOverview: ({ onOpenUploadDialog }: { onOpenUploadDialog: () => void }) => (
    <button type="button" onClick={onOpenUploadDialog}>上传月度会计报表</button>
  ),
}));

vi.mock('./FinancialStatementsUploadDialog', () => ({
  FinancialStatementsUploadDialog: ({
    open,
    preview,
    onUploadFileChange,
    onYearChange,
    onMonthChange,
    onPreview,
    onConfirm,
  }: {
    open: boolean;
    preview: { previewId: string } | null;
    onUploadFileChange: (file: File) => void;
    onYearChange: (value: string) => void;
    onMonthChange: (value: string) => void;
    onPreview: () => void;
    onConfirm: () => void;
  }) => open ? (
    <div>
      <button
        type="button"
        onClick={() => {
          onUploadFileChange(new File(['workbook'], 'month.xlsx'));
          onYearChange('2026');
          onMonthChange('7');
        }}
      >
        选择测试月报
      </button>
      <button type="button" onClick={onPreview}>执行只读预览</button>
      {preview && <button type="button" onClick={onConfirm}>确认写入预览</button>}
    </div>
  ) : null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const preview = {
  previewId: 'preview-1',
  ready: true,
  period: { year: 2026, month: 7, periodLabel: '2026年7账期', reportDate: '2026-07-31', existing: false },
  summary: {
    balanceSheetFieldCount: 3,
    incomeStatementFieldCount: 3,
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
  warnings: [],
};

describe('FinancialStatementsPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnalytics.mockResolvedValue({ trends: [], alerts: [], historicalAlerts: [], latestPeriod: null, totalPeriods: 0 });
    mockListStatements.mockResolvedValue([]);
    mockPreviewFile.mockResolvedValue(preview);
    mockConfirmFile.mockResolvedValue({ message: '2026年7账期 已确认写入', data: { imported: 1 } });
  });

  it('选择文件后必须先生成预览，确认动作才会出现并写入', async () => {
    const user = userEvent.setup();
    render(<FinancialStatementsPageContent />);

    await user.click(await screen.findByRole('button', { name: '上传月度会计报表' }));
    await user.click(screen.getByRole('button', { name: '选择测试月报' }));
    expect(screen.queryByRole('button', { name: '确认写入预览' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '执行只读预览' }));
    await waitFor(() => expect(mockPreviewFile).toHaveBeenCalledTimes(1));
    expect(mockConfirmFile).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: '确认写入预览' }));
    await waitFor(() => {
      expect(mockConfirmFile).toHaveBeenCalledWith(
        expect.any(File),
        2026,
        7,
        'preview-1',
        false,
        '2026年7账期',
      );
    });
  });
});
