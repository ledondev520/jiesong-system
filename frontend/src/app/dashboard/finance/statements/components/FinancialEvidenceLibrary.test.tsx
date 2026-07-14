import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FinancialEvidenceLibrary } from './FinancialEvidenceLibrary';

vi.mock('@/services/financialStatements.service', () => ({
  financialStatementsService: {
    getEvidenceSummary: vi.fn(async () => ({
      totals: { documentCount: 77, sheetCount: 257, rowCount: 5289, redactionCount: 618 },
      categories: [{ category: 'PAYROLL', categoryLabel: '工资', analysisScope: 'PAYROLL', documentCount: 6, sheetCount: 6, rowCount: 42, redactionCount: 54 }],
      periods: ['2026-01', '2026-02'],
      latestImportedAt: '2026-07-14T00:00:00.000Z',
    })),
    listEvidenceDocuments: vi.fn(async () => ({
      items: [{
        id: 'doc-1', fileName: '工资表.xls', relativePath: '2026/工资表.xls', category: 'PAYROLL', categoryLabel: '工资', analysisScope: 'PAYROLL',
        periodYear: 2026, periodMonth: 1, importedSheetCount: 1, rowCount: 7, numericCellCount: 10, textCellCount: 12,
        redactionCount: 9, originalArchived: false, importedAt: '2026-07-14T00:00:00.000Z',
      }], page: 1, pageSize: 100, total: 1, totalPages: 1,
    })),
    getEvidenceDocument: vi.fn(async () => ({
      id: 'doc-1', fileName: '工资表.xls', relativePath: '2026/工资表.xls', category: 'PAYROLL', categoryLabel: '工资', analysisScope: 'PAYROLL',
      periodYear: 2026, periodMonth: 1, importedSheetCount: 1, rowCount: 7, numericCellCount: 10, textCellCount: 12,
      redactionCount: 9, originalArchived: false, importedAt: '2026-07-14T00:00:00.000Z',
      sheets: [{ id: 'sheet-1', sheetIndex: 0, sheetName: '工资', sourceRange: 'A1:C7', rowCount: 7, columnCount: 3, redactionCount: 9 }],
      selectedSheet: { id: 'sheet-1', sheetIndex: 0, sheetName: '工资', sourceRange: 'A1:C7', rowCount: 7, columnCount: 3, redactionCount: 9 },
      rows: [{ id: 'row-1', sourceRow: 2, rowKind: 'DATA', values: ['<已脱敏>', 1000], numericCellCount: 1, textCellCount: 1, redactionCount: 1 }],
      pagination: { page: 1, pageSize: 50, total: 7, totalPages: 1 },
    })),
  },
}));

describe('FinancialEvidenceLibrary', () => {
  it('展示资料计数、隐私说明和已脱敏行', async () => {
    render(<FinancialEvidenceLibrary />);

    expect(await screen.findByTestId('financial-evidence-library')).toBeInTheDocument();
    expect(screen.getByText('77 份资料')).toBeInTheDocument();
    expect(screen.getByText('257 个 Sheet')).toBeInTheDocument();
    expect(screen.getByText('618 处脱敏')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('<已脱敏>')).toBeInTheDocument());
    expect(screen.getByText(/原文件未归档/)).toBeInTheDocument();
  });
});
