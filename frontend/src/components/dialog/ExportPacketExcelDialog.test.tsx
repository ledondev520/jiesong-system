import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPacketExcelDialog } from "./ExportPacketExcelDialog";

const { previewExcel, generateExcel, saveBlob } = vi.hoisted(() => ({
  previewExcel: vi.fn(),
  generateExcel: vi.fn(),
  saveBlob: vi.fn(),
}));
vi.mock("@/services/exportPacket.service", () => ({
  exportPacketService: { previewExcel, generateExcel },
}));
vi.mock("@/services/fileDownload", () => ({ saveBlobToFile: saveBlob }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const result = (unitPrice = 500) => ({
  contracts: [{ contractNo: "EXP990001", rowCount: 1 }],
  selectedContractNo: "EXP990001",
  sourceVersion: "source-sha",
  packetVersion: `packet-${unitPrice}`,
  excludedRows: [],
  taxVersion: "TEST",
  input: {
    spotRate: 6.8,
    sellerName: "合成卖方",
    buyerName: "Synthetic Buyer",
    packageKind: "CARTON",
    tradeTerm: "FOB",
    documentDate: "2026-11-14",
    priceOverrides:
      unitPrice === 500
        ? []
        : [{ packingItemId: "row-2", unitPriceUsd: unitPrice }],
  },
  packet: {
    contractNo: "EXP990001",
    ready: true,
    issues: [],
    pricingPolicy: { effectiveRate: 6.6 },
    summary: {
      lineCount: 1,
      boxes: 14,
      totalUsd: unitPrice * 4,
      purchaseCostCny: 10000,
      costMarkupRate: 0.32,
      salesGrossMarginRate: 0.242424,
    },
    lines: [
      {
        index: 1,
        packingItemId: "row-2",
        productName: "合成设备",
        hsCode: "9999999999",
        quantity: 4,
        unit: "台",
        unitPriceUsd: unitPrice,
        totalUsd: unitPrice * 4,
        pricingSource: unitPrice === 500 ? "formula" : "manual",
      },
    ],
  },
});
const file = () =>
  new File(["synthetic xlsx"], "出货汇总.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
const upload = async () => {
  fireEvent.change(screen.getByLabelText("上传出货汇总Excel"), {
    target: { files: [file()] },
  });
  await waitFor(() => expect(previewExcel).toHaveBeenCalled());
};

describe("Excel 出四单", () => {
  beforeEach(() => {
    previewExcel.mockReset().mockResolvedValue({ data: result() });
    generateExcel.mockReset().mockResolvedValue(
      new Blob(["xlsx"], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    saveBlob.mockReset();
  });

  it("单票完整文件自动生成下载，展示两种利润率", async () => {
    render(<ExportPacketExcelDialog open onOpenChange={vi.fn()} />);
    await upload();
    await waitFor(() => expect(saveBlob).toHaveBeenCalledOnce());
    expect(generateExcel.mock.calls[0][1]).toMatchObject({
      contractNo: "EXP990001",
      sourceVersion: "source-sha",
      packetVersion: "packet-500",
    });
    expect(screen.getByText("32.00%")).toBeInTheDocument();
    expect(screen.getByText("24.24%")).toBeInTheDocument();
    expect(
      screen.getByText(/四单已生成并下载，共 1 行、14 箱/),
    ).toBeInTheDocument();
  });

  it("多票文件等待选择，不自动猜一票或下载", async () => {
    previewExcel.mockResolvedValue({
      data: {
        ...result(),
        selectedContractNo: null,
        packet: null,
        contracts: [
          { contractNo: "EXP990001", rowCount: 1 },
          { contractNo: "EXP990002", rowCount: 2 },
        ],
      },
    });
    render(<ExportPacketExcelDialog open onOpenChange={vi.fn()} />);
    await upload();
    await screen.findByRole("combobox", { name: "本次合同号" });
    expect(generateExcel).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("人工改价后必须重算，下载采用新版本且不丢原文件", async () => {
    render(<ExportPacketExcelDialog open onOpenChange={vi.fn()} />);
    await upload();
    await waitFor(() => expect(saveBlob).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("合成设备出口单价"), {
      target: { value: "600" },
    });
    expect(screen.getByRole("button", { name: "下载四单" })).toBeDisabled();
    previewExcel.mockResolvedValueOnce({ data: result(600) });
    fireEvent.click(screen.getByRole("button", { name: "重新计算" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下载四单" })).toBeEnabled(),
    );
    expect(previewExcel.mock.calls[1][1].priceOverrides).toEqual([
      { packingItemId: "row-2", unitPriceUsd: 600 },
    ]);
    expect(generateExcel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "下载四单" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(2));
    expect(generateExcel.mock.calls[1][1]).toMatchObject({
      packetVersion: "packet-600",
      priceOverrides: [{ packingItemId: "row-2", unitPriceUsd: 600 }],
    });
  });

  it("关闭后不处理迟到结果，也不启动下载", async () => {
    let release!: (value: unknown) => void;
    previewExcel.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const close = vi.fn();
    render(<ExportPacketExcelDialog open onOpenChange={close} />);
    await upload();
    fireEvent.click(screen.getAllByRole("button", { name: /^关闭$/ })[0]);
    release({ data: result() });
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(generateExcel).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

it("原生拖放支持单个xlsx，拒绝多文件和错误格式", async () => {
  previewExcel.mockReset().mockResolvedValue({ data: result() });
  generateExcel.mockReset().mockResolvedValue(new Blob(["xlsx"]));
  render(<ExportPacketExcelDialog open onOpenChange={vi.fn()} />);
  const dropArea = screen.getByText("拖入 Excel，或点击选择文件");
  fireEvent.drop(dropArea, { dataTransfer: { files: [file(), file()] } });
  expect(previewExcel).not.toHaveBeenCalled();
  expect(
    screen.getByText("请上传一个不超过10MB的 .xlsx 文件"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("上传出货汇总Excel"), {
    target: { files: [new File(["bad"], "bad.csv")] },
  });
  expect(previewExcel).not.toHaveBeenCalled();
  fireEvent.drop(dropArea, { dataTransfer: { files: [file()] } });
  await waitFor(() => expect(previewExcel).toHaveBeenCalledTimes(1));
});
