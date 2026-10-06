/**
 * Input: active purchase page with generated synthetic workbook bytes and mocked HTTP service
 * Output: cancel, mixed-result and failed-request/reselection component lifecycle coverage
 * Pos: purchase Excel UI regression; jsdom components, not a browser or database claim
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import ContractsPage from "./page";

const mockImportExcel = vi.fn();
const mockGetAll = vi.fn();
const mockInvalidateCache = vi.fn();
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => "" }),
  usePathname: () => "/dashboard/contracts",
}));
vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    importExcel: (...args: unknown[]) => mockImportExcel(...args),
  },
}));
vi.mock("@/services/contractDoc.service", () => ({
  contractDocService: {
    getTemplates: async () => ({ data: { items: [] } }),
  },
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: "ADMIN" } }),
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: (...args: unknown[]) => mockInvalidateCache(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const workbookFile = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["合同编号", "供应商名称", "签订日期", "总金额", "状态"],
      ["SYNTHETIC-UI-IMPORT", "合成 UI 供应商", "2026-10-01", 123.45, "草稿"],
    ]),
    "合成采购合同",
  );
  return new File(
    [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
    "synthetic-ui-purchase.xlsx",
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  );
};
const fileInput = () =>
  document.querySelector("#contract-import-file-input") as HTMLInputElement;
const openImport = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getAllByRole("button", { name: "批量导入" })[0]);
  return screen.findByRole("dialog");
};

describe("active purchase Excel import component lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    mockImportExcel.mockReset();
    mockImportExcel.mockResolvedValue({
      data: { successRows: 1, failedRows: 0, errors: [] },
    });
  });

  it("cancel and an empty file selection do not upload; reopening resets the historical choice", async () => {
    const user = userEvent.setup();
    render(<ContractsPage />);
    const dialog = await openImport(user);
    const history = within(dialog).getByRole("checkbox", {
      name: /历史采购补录/,
    });
    await user.click(history);
    expect(history).toBeChecked();
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(mockImportExcel).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mockImportExcel).not.toHaveBeenCalled();
    const reopened = await openImport(user);
    expect(
      within(reopened).getByRole("checkbox", { name: /历史采购补录/ }),
    ).not.toBeChecked();
    expect(within(reopened).queryByText("导入预览")).not.toBeInTheDocument();
  });

  it("mixed-row result shows real service row errors and refreshes the purchase list", async () => {
    mockImportExcel.mockResolvedValue({
      data: {
        successRows: 2,
        failedRows: 1,
        errors: [{ row: 3, error: "第 3 行：总金额格式不正确" }],
      },
    });
    const user = userEvent.setup();
    render(<ContractsPage />);
    await openImport(user);
    const initialLoads = mockGetAll.mock.calls.length;
    const file = workbookFile();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    const result = await screen.findByRole("dialog");
    expect(
      within(result).getByRole("heading", { name: "导入结果" }),
    ).toBeInTheDocument();
    expect(
      within(result).getByText("成功 2 条，失败 1 条"),
    ).toBeInTheDocument();
    expect(
      within(result).getByText("第 3 行：总金额格式不正确"),
    ).toBeInTheDocument();
    expect(within(result).getByText("3")).toBeInTheDocument();
    expect(mockImportExcel).toHaveBeenCalledExactlyOnceWith(file);
    expect(fileInput().value).toBe("");
    expect(mockToastWarning).toHaveBeenCalledWith(
      "导入完成：成功 2 条，失败 1 条",
    );
    expect(mockInvalidateCache).toHaveBeenCalledWith("purchase-contracts-list");
    await waitFor(() =>
      expect(mockGetAll.mock.calls.length).toBeGreaterThan(initialLoads),
    );
    await user.click(
      within(result).getAllByRole("button", { name: "关闭" })[0],
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("failed upload releases busy state so the same file can be selected and imported again", async () => {
    let rejectUpload!: (reason: Error) => void;
    mockImportExcel.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectUpload = reject;
      }),
    );
    const user = userEvent.setup();
    render(<ContractsPage />);
    await openImport(user);
    const file = workbookFile();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(fileInput()).toBeDisabled();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(mockImportExcel).toHaveBeenCalledTimes(1);
    rejectUpload(new Error("合成上传请求失败"));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("合成上传请求失败"),
    );
    expect(
      screen.queryByRole("heading", { name: "导入结果" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(fileInput()).not.toBeDisabled());
    await openImport(user);
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(
      await screen.findByRole("heading", { name: "导入结果" }),
    ).toBeInTheDocument();
    expect(mockImportExcel).toHaveBeenCalledTimes(2);
    expect(mockImportExcel).toHaveBeenLastCalledWith(file);
    expect(mockToastSuccess).toHaveBeenCalledWith("成功导入 1 条合同");
  });
});
