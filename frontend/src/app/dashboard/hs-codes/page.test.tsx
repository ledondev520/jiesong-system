import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HsCodesPage from "./page";

vi.mock(
  "@/components/ui/date-picker",
  () => import("@/test/date-string-picker-mock"),
);

const mockList = vi.fn();
const mockUpdate = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/hs-codes",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/services/hsCode.service", () => ({
  hsCodeService: {
    list: (...args: unknown[]) => mockList(...args),
    search: vi.fn(),
    getByCode: vi.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe("HsCodesPage", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockUpdate.mockReset();
    mockList.mockResolvedValue({
      data: {
        items: [
          {
            id: "hs-1",
            hsCode: "69072190",
            productName: "抛光瓷砖",
            unit: "平方米",
            refundRate: 13,
            supervisionConditions: "A:入境货物通关单 | B:出境货物通关单",
            inspectionQuarantine: "M:进口商品检验 | N:出口商品检验",
            declarationElements: "品牌类型|出口享惠情况|用途|加工程度",
          },
        ],
        pagination: {
          page: 1,
          pageSize: 50,
          total: 1,
          totalPages: 1,
        },
      },
    });
    mockUpdate.mockResolvedValue({
      data: {
        id: "hs-1",
        hsCode: "69072190",
        productName: "抛光瓷砖",
        unit: "平方米",
        refundRate: 0,
        vatRate: 13,
        effectiveDate: "2026-01-01T00:00:00.000Z",
        sourceUrl: "https://www.chinatax.gov.cn/example",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("默认先加载 HSCode 列表", async () => {
    render(<HsCodesPage />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );
    });
    expect(
      await screen.findByRole("cell", { name: "抛光瓷砖" }),
    ).toBeInTheDocument();
  });

  it("编码位数提示一致：占位符、帮助文案与输入上限都是 4–12 位", async () => {
    render(<HsCodesPage />);

    const codeInput = await screen.findByPlaceholderText("编码前缀（4–12位）");
    expect(screen.getByText(/4–12 位纯数字 HS 编码/)).toBeInTheDocument();
    fireEvent.change(codeInput, { target: { value: "1234567890123456" } });
    expect(codeInput).toHaveValue("123456789012");
  });

  it("输入关键字后按关键字重新加载列表", async () => {
    render(<HsCodesPage />);

    const input =
      await screen.findByPlaceholderText("商品名称（支持模糊匹配）");
    fireEvent.change(input, { target: { value: "瓷砖" } });

    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: "瓷砖", page: 1, pageSize: 20 }),
      );
    });
  });

  it("详情页将申报要素拆分为更直观的分项展示", async () => {
    render(<HsCodesPage />);

    fireEvent.click(await screen.findByRole("cell", { name: "抛光瓷砖" }));

    expect(await screen.findByText("申报要素")).toBeInTheDocument();
    expect(screen.getByText("品牌类型")).toBeInTheDocument();
    expect(screen.getByText("出口享惠情况")).toBeInTheDocument();
    expect(screen.getByText("用途")).toBeInTheDocument();
    expect(screen.getByText("加工程度")).toBeInTheDocument();
  });

  it("副标题和列表不出现 trim/hsCode 等内部词，申报要素为编号清单并可复制 (B46)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<HsCodesPage />);

    await screen.findByRole("cell", { name: "抛光瓷砖" });
    expect(document.body.textContent).not.toMatch(/trim|hsCode/);
    expect(screen.getByText("4 项要素")).toBeInTheDocument();
    expect(
      screen.queryByText(/品牌类型\|出口享惠情况/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("cell", { name: "抛光瓷砖" }));
    const list = (await screen.findByText("品牌类型")).closest("ol")!;
    expect(list.querySelectorAll("li")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "复制要素清单" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "1. 品牌类型\n2. 出口享惠情况\n3. 用途\n4. 加工程度",
      ),
    );
  });

  it("详情页将监管条件与检验检疫拆分为可视化条目", async () => {
    render(<HsCodesPage />);

    fireEvent.click(await screen.findByRole("cell", { name: "抛光瓷砖" }));

    expect(await screen.findByText("监管条件")).toBeInTheDocument();
    expect(screen.getByText("入境货物通关单")).toBeInTheDocument();
    expect(screen.getByText("出境货物通关单")).toBeInTheDocument();

    expect(screen.getByText("检验检疫")).toBeInTheDocument();
    expect(screen.getByText("进口商品检验")).toBeInTheDocument();
    expect(screen.getByText("出口商品检验")).toBeInTheDocument();
  });

  it("详情页可人工更新退税率并强制留存生效日期和来源", async () => {
    render(<HsCodesPage />);

    fireEvent.click(await screen.findByRole("cell", { name: "抛光瓷砖" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "人工更新税则" }),
    );

    fireEvent.change(screen.getByLabelText("出口退税率（%）"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("生效日期"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("官方来源链接"), {
      target: { value: "https://www.chinatax.gov.cn/example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存税则证据" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "69072190",
        expect.objectContaining({
          refundRate: 0,
          effectiveDate: "2026-01-01",
          sourceUrl: "https://www.chinatax.gov.cn/example",
        }),
      );
    });
  });
});
