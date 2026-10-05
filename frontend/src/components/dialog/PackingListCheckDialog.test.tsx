/**
 * Input: PackingListCheckDialog 与 salesService mock
 * Output: 船司 PDF 原件归档、核对历史和人工结论交互测试
 * Pos: 出口单证阶段对话框回归测试
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackingListCheckDialog } from "./PackingListCheckDialog";

const mockList = vi.fn();
const mockCheck = vi.fn();
const mockReview = vi.fn();
const mockFetchBlob = vi.fn();
const createUrl = vi.fn(() => "blob:synthetic-carrier");
const revokeUrl = vi.fn();
const clickAnchor = vi.fn();
vi.mock("@/services/contractFile.service", async (original) => ({
  ...(await original<typeof import("@/services/contractFile.service")>()),
  fetchContractFileBlob: (...args: unknown[]) => mockFetchBlob(...args),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

vi.mock("@/services/sales.service", () => ({
  salesService: {
    listPackingListChecks: (...args: unknown[]) => mockList(...args),
    checkPackingList: (...args: unknown[]) => mockCheck(...args),
    reviewPackingListCheck: (...args: unknown[]) => mockReview(...args),
  },
}));

const record = (overrides: Record<string, unknown> = {}) => ({
  id: "check-1",
  salesContractId: "sales-1",
  salesContractFileId: "file-1",
  automaticStatus: "DIFFERENCE",
  status: "DIFFERENCE",
  fieldMismatched: 1,
  itemCheckMismatched: 0,
  parserVersion: "2026-07-product-scoped-v1",
  checkedAt: "2026-07-10T00:00:00.000Z",
  reviewedAt: null,
  reviewNote: null,
  checkedBy: { id: "user-1", name: "核对员" },
  reviewedBy: null,
  file: {
    id: "file-1",
    fileName: "carrier.pdf",
    uploadedAt: "2026-07-10T00:00:00.000Z",
  },
  comparison: {
    summary: {
      ok: false,
      manualReviewRequired: false,
      fieldTotal: 5,
      fieldMismatched: 1,
      itemCheckTotal: 3,
      itemCheckMismatched: 0,
      pdfNumberCount: 10,
      pdfTextLength: 100,
    },
    fields: [
      {
        key: "grossWeight",
        label: "毛重 (kg)",
        expected: 22000,
        matched: false,
        closest: 21000,
      },
    ],
    items: [
      {
        productName: "陶瓷杯",
        hsCode: "6911101900",
        identity: {
          expected: "陶瓷杯 / 6911101900",
          matched: true,
          closest: "陶瓷杯",
        },
        boxes: { expected: 10, matched: true, closest: 10 },
        quantity: { expected: 100, matched: true, closest: 100 },
      },
    ],
  },
  ...overrides,
});

describe("PackingListCheckDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchBlob
      .mockReset()
      .mockResolvedValue(
        new Blob(["synthetic carrier"], { type: "application/pdf" }),
      );
    class ObjectURL extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    }
    vi.stubGlobal("URL", ObjectURL);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickAnchor(this.href, this.download);
    });
    mockList.mockResolvedValue({ data: [record()] });
  });

  it("打开时读取持久化核对历史并展示原文件与差异", async () => {
    render(
      <PackingListCheckDialog
        open
        onOpenChange={vi.fn()}
        contractId="sales-1"
        contractNo="EXP260001"
      />,
    );

    expect(await screen.findByText("核对历史")).toBeInTheDocument();
    expect(screen.getAllByText("carrier.pdf").length).toBeGreaterThan(0);
    expect(screen.getByText("发现 1 处差异")).toBeInTheDocument();
    expect(screen.getByText("陶瓷杯")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith("sales-1", 20);
  });

  it("上传 PDF 后返回持久化记录并通知详情页刷新附件", async () => {
    const onChanged = vi.fn();
    mockList.mockResolvedValue({ data: [] });
    mockCheck.mockResolvedValue({
      data: record({ status: "PASSED", automaticStatus: "PASSED" }),
    });
    render(
      <PackingListCheckDialog
        open
        onOpenChange={vi.fn()}
        contractId="sales-1"
        contractNo="EXP260001"
        onChanged={onChanged}
      />,
    );

    const file = new File(["%PDF"], "carrier.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("上传船司装箱单 PDF"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(mockCheck).toHaveBeenCalledWith("sales-1", file),
    );
    expect(await screen.findByText(/原 PDF 已归档/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("差异记录可保存人工通过结论和说明", async () => {
    mockReview.mockResolvedValue({
      data: record({
        status: "APPROVED",
        reviewNote: "已与船司逐项复核",
        reviewedBy: { id: "reviewer-1", name: "复核人" },
      }),
    });
    render(
      <PackingListCheckDialog
        open
        onOpenChange={vi.fn()}
        contractId="sales-1"
        contractNo="EXP260001"
      />,
    );

    const note = await screen.findByLabelText("人工核对说明");
    fireEvent.change(note, { target: { value: "已与船司逐项复核" } });
    fireEvent.click(screen.getByRole("button", { name: "人工确认通过" }));

    await waitFor(() => {
      expect(mockReview).toHaveBeenCalledWith(
        "sales-1",
        "check-1",
        "APPROVED",
        "已与船司逐项复核",
      );
    });
    await waitFor(() => {
      expect(screen.getAllByText("人工确认通过").length).toBeGreaterThan(0);
    });
  });
  it("原件经过共享认证二进制请求下载而非无Bearer链接", async () => {
    render(
      <PackingListCheckDialog
        open
        onOpenChange={vi.fn()}
        contractId="sales-1"
        contractNo="SYNTHETIC"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "下载原件" }));
    await waitFor(() =>
      expect(mockFetchBlob).toHaveBeenCalledWith(
        "file-1",
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(clickAnchor).toHaveBeenCalledWith(
        "blob:synthetic-carrier",
        "carrier.pdf",
      ),
    );
    expect(
      screen.queryByRole("link", { name: "打开原件" }),
    ).not.toBeInTheDocument();
  });
  it("关闭核对对话框取消迟到原件下载且不创建URL", async () => {
    let resolve!: (blob: Blob) => void;
    mockFetchBlob.mockReturnValue(
      new Promise<Blob>((yes) => {
        resolve = yes;
      }),
    );
    const view = render(
      <PackingListCheckDialog
        open
        onOpenChange={vi.fn()}
        contractId="sales-1"
        contractNo="SYNTHETIC"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "下载原件" }));
    const signal = mockFetchBlob.mock.calls[0][1];
    view.rerender(
      <PackingListCheckDialog
        open={false}
        onOpenChange={vi.fn()}
        contractId="sales-1"
        contractNo="SYNTHETIC"
      />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve(new Blob(["old"], { type: "application/pdf" })),
    );
    expect(createUrl).not.toHaveBeenCalled();
    expect(clickAnchor).not.toHaveBeenCalled();
  });
});
