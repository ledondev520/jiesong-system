/**
 * Input: 采购合同页面、purchaseService、router、URL参数、toast
 * Output: 采购合同页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContractsPage from "./page";

const mockPush = vi.fn();
const mockSearchParamGet = vi.fn();
const mockGetAll = vi.fn();
const mockGetTemplates = vi.fn();
const mockToastError = vi.fn();
const mockImportExcel = vi.fn();
let mockRole = "ADMIN";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (...args: unknown[]) => mockSearchParamGet(...args),
  }),
  usePathname: () => "/dashboard/contracts",
}));

vi.mock("@/services/purchase.service", () => ({
  purchaseService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    getById: vi.fn(),
    importExcel: (...args: unknown[]) => mockImportExcel(...args),
  },
}));

vi.mock("@/services/contractDoc.service", () => ({
  contractDocService: {
    generateFromPurchase: vi.fn(),
    downloadDocument: vi.fn(),
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    uploadTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/api-cache", () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: mockRole } }),
}));

describe("ContractsPage 交互逻辑", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRole = "ADMIN";
    mockImportExcel.mockResolvedValue({
      data: { successRows: 1, failedRows: 0, errors: [] },
    });
    mockSearchParamGet.mockReset();
    mockGetAll.mockReset();
    mockGetTemplates.mockReset();
    mockToastError.mockReset();
    mockSearchParamGet.mockReturnValue("");
    mockGetTemplates.mockResolvedValue({ data: { items: [] } });
  });

  it("加载后展示采购模块概览与空态文案", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<ContractsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "采购合同" }),
      ).toBeInTheDocument();
      expect(screen.getByText("采购执行概览")).toBeInTheDocument();
      expect(screen.getByText("合作店铺")).toBeInTheDocument();
      expect(screen.getAllByText("暂无采购合同").length).toBeGreaterThan(0);
    });
  });

  it("总数和翻页使用后端目录，合同、供应商和商品查询发送到后端", async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [],
        pagination: { total: 223, page: 1, pageSize: 20, totalPages: 12 },
        summary: { statusCounts: { DRAFT: 123 }, stores: ["第二页店铺"] },
      },
    });
    const user = userEvent.setup();
    render(<ContractsPage />);
    expect(await screen.findByText(/共 223 条/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "12" }));
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 12, pageSize: 20 }),
      ),
    );
    await user.type(
      screen.getByPlaceholderText("搜索合同号、供应商或商品..."),
      "第二商品",
    );
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, keyword: "第二商品" }),
      ),
    );
    await user.clear(
      screen.getByRole("textbox", { name: "搜索合同号、供应商或商品" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "搜索合同号、供应商或商品" }),
      "SYNTHETIC-42",
    );
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, keyword: "SYNTHETIC-42" }),
      ),
    );
    expect(mockGetAll.mock.lastCall?.[0]).not.toHaveProperty("productKeyword");
    await user.click(screen.getByRole("button", { name: "重置" }));
    await waitFor(() =>
      expect(mockGetAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, keyword: undefined }),
      ),
    );
  });

  it("点击新增采购按钮会跳转创建页", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<ContractsPage />);

    await user.click(screen.getAllByRole("button", { name: /新增采购/ })[0]);
    expect(mockPush).toHaveBeenCalledWith("/dashboard/purchase/create");
  });

  it("合同模板在采购合同页内弹窗管理", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    mockGetTemplates.mockResolvedValue({
      data: {
        items: [
          {
            exists: true,
            filename: "购销合同模板.docx",
            size: 2048,
            updatedAt: "2026-03-01T10:00:00.000Z",
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ContractsPage />);

    const templateButtons = await screen.findAllByRole("button", {
      name: /合同模板/,
    });
    await user.click(templateButtons[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("购销合同模板.docx")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith("/dashboard/contract-templates");
  });

  it("加载失败时提示错误", async () => {
    mockGetAll.mockRejectedValue(new Error("load failed"));
    render(<ContractsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("加载采购合同失败");
    });
  });

  it("提供移动端筛选入口与合同卡片动作", async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [
          {
            id: "purchase-1",
            contractNo: "CG2500001",
            status: "SIGNED",
            totalAmount: 12800,
            paidAmount: 6400,
            signedAt: "2026-03-24T00:00:00.000Z",
            storeName: "上海店",
            supplier: { name: "佛山陶瓷有限公司", hasQualityIssue: false },
            items: [
              {
                id: "item-1",
                product: { customsName: "瓷砖" },
              },
            ],
          },
        ],
      },
    });
    render(<ContractsPage />);

    expect(
      await screen.findByRole("button", { name: "筛选与搜索" }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText("CG2500001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("上海店").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "查看 CG2500001 详情" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "为 CG2500001 生成购销合同" }),
    ).toHaveLength(2);
  });
  it("管理员每次导入默认正常，明确勾选历史确认才提交historical", async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<ContractsPage />);
    await screen.findByRole("heading", { name: "采购合同" });
    await userEvent
      .setup()
      .click(screen.getAllByRole("button", { name: "批量导入" })[0]);
    expect(
      screen.getByRole("heading", { name: "导入采购合同" }),
    ).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", {
      name: /我确认这是历史采购补录/,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    const file = new File(["synthetic"], "synthetic.xlsx");
    fireEvent.change(document.querySelector("#contract-import-file-input")!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(mockImportExcel).toHaveBeenCalledWith(file, { historical: true }),
    );
  });
  it("采购员没有历史确认，正常导入不携带历史参数", async () => {
    mockRole = "PURCHASE";
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<ContractsPage />);
    await screen.findByRole("heading", { name: "采购合同" });
    await userEvent
      .setup()
      .click(screen.getAllByRole("button", { name: "批量导入" })[0]);
    expect(
      screen.queryByRole("checkbox", { name: /历史采购补录/ }),
    ).not.toBeInTheDocument();
    const file = new File(["synthetic"], "synthetic.xlsx");
    fireEvent.change(document.querySelector("#contract-import-file-input")!, {
      target: { files: [file] },
    });
    await waitFor(() => expect(mockImportExcel).toHaveBeenCalledWith(file));
  });
});
