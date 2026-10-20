/**
 * Input: 财务资料库公开查询边界与可控合成响应
 * Output: 资料计数/隐私说明、空筛选及迟到旧Sheet的界面回归
 * Pos: 资料库组件测试；真实来源/数据库另由独立HTTP集成覆盖
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { FinancialEvidenceLibrary } from "./FinancialEvidenceLibrary";
import { financialStatementsService } from "@/services/financialStatements.service";

vi.mock("@/services/financialStatements.service", () => ({
  financialStatementsService: {
    getEvidenceSummary: vi.fn(async () => ({
      totals: {
        documentCount: 77,
        sheetCount: 257,
        rowCount: 5289,
        redactionCount: 618,
      },
      categories: [
        {
          category: "PAYROLL",
          categoryLabel: "工资",
          analysisScope: "PAYROLL",
          documentCount: 6,
          sheetCount: 6,
          rowCount: 42,
          redactionCount: 54,
        },
      ],
      periods: ["2026-01", "2026-02"],
      latestImportedAt: "2026-07-14T00:00:00.000Z",
    })),
    listEvidenceDocuments: vi.fn(async () => ({
      items: [
        {
          id: "doc-1",
          fileName: "工资表.xls",
          relativePath: "2026/工资表.xls",
          category: "PAYROLL",
          categoryLabel: "工资",
          analysisScope: "PAYROLL",
          periodYear: 2026,
          periodMonth: 1,
          importedSheetCount: 1,
          rowCount: 7,
          numericCellCount: 10,
          textCellCount: 12,
          redactionCount: 9,
          originalArchived: false,
          importedAt: "2026-07-14T00:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    })),
    getEvidenceDocument: vi.fn(async () => ({
      id: "doc-1",
      fileName: "工资表.xls",
      relativePath: "2026/工资表.xls",
      category: "PAYROLL",
      categoryLabel: "工资",
      analysisScope: "PAYROLL",
      periodYear: 2026,
      periodMonth: 1,
      importedSheetCount: 1,
      rowCount: 7,
      numericCellCount: 10,
      textCellCount: 12,
      redactionCount: 9,
      originalArchived: false,
      importedAt: "2026-07-14T00:00:00.000Z",
      sheets: [
        {
          id: "sheet-1",
          sheetIndex: 0,
          sheetName: "工资",
          sourceRange: "A1:C7",
          rowCount: 7,
          columnCount: 3,
          redactionCount: 9,
        },
      ],
      selectedSheet: {
        id: "sheet-1",
        sheetIndex: 0,
        sheetName: "工资",
        sourceRange: "A1:C7",
        rowCount: 7,
        columnCount: 3,
        redactionCount: 9,
      },
      rows: [
        {
          id: "row-1",
          sourceRow: 2,
          rowKind: "DATA",
          values: ["<已脱敏>", 1000],
          numericCellCount: 1,
          textCellCount: 1,
          redactionCount: 1,
        },
      ],
      pagination: { page: 1, pageSize: 50, total: 7, totalPages: 1 },
    })),
  },
}));

describe("FinancialEvidenceLibrary", () => {
  it("展示资料计数、隐私说明和已脱敏行", async () => {
    render(<FinancialEvidenceLibrary />);

    expect(
      await screen.findByTestId("financial-evidence-library"),
    ).toBeInTheDocument();
    expect(screen.getByText("77 份资料")).toBeInTheDocument();
    expect(screen.getByText("257 个 Sheet")).toBeInTheDocument();
    expect(screen.getByText("618 处脱敏")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("<已脱敏>")).toBeInTheDocument(),
    );
    expect(screen.getByText(/原文件未归档/)).toBeInTheDocument();
  });

  it("筛选没有来源时清除上一份资料及其行", async () => {
    render(<FinancialEvidenceLibrary />);
    await screen.findByText("<已脱敏>");
    vi.mocked(
      financialStatementsService.listEvidenceDocuments,
    ).mockResolvedValueOnce({
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
      totalPages: 0,
    });
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: "2026-02" }));
    await screen.findByText("当前筛选 0 份");
    await waitFor(() =>
      expect(screen.queryByText("工资表.xls")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("<已脱敏>")).not.toBeInTheDocument();
  });

  it("切换来源后忽略上一来源迟到的Sheet明细", async () => {
    const first = await financialStatementsService.getEvidenceDocument("doc-1");
    const noteSheet = {
      ...first.sheets[0],
      id: "sheet-old-note",
      sheetName: "旧备注",
    };
    const next = {
      ...first,
      id: "doc-2",
      fileName: "总账.xlsx",
      categoryLabel: "总账",
    };
    vi.mocked(
      financialStatementsService.listEvidenceDocuments,
    ).mockResolvedValueOnce({
      items: [first, next],
      page: 1,
      pageSize: 100,
      total: 2,
      totalPages: 1,
    });
    vi.mocked(
      financialStatementsService.getEvidenceDocument,
    ).mockResolvedValueOnce({ ...first, sheets: [...first.sheets, noteSheet] });
    render(<FinancialEvidenceLibrary />);
    await screen.findByText("工资表.xls");
    let completeOld!: (detail: typeof first) => void;
    vi.mocked(
      financialStatementsService.getEvidenceDocument,
    ).mockReturnValueOnce(
      new Promise((resolve) => {
        completeOld = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "旧备注（7）" }));
    vi.mocked(
      financialStatementsService.getEvidenceDocument,
    ).mockResolvedValueOnce(next);
    fireEvent.click(screen.getByRole("button", { name: /总账.*2026-01/ }));
    await screen.findByText("总账.xlsx");
    await act(async () => {
      completeOld({ ...first, selectedSheet: noteSheet });
    });
    expect(screen.getByText("总账.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("工资表.xls")).not.toBeInTheDocument();
  });
});
