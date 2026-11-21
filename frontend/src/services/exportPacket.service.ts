import { authFetchInit } from "@/lib/browser-session";
/**
 * Input: EXP 编号、本票现汇/买方/包装种类/单证日期及人工确认价格
 * Output: 出口四单只读预检、生成归档和受保护文件下载
 * Pos: 出口四单工作台前端数据 Module
 */

import api from "@/lib/axios";
import { downloadResponseBlob } from "./fileDownload";
import type { ApiResponse } from "@/types";

export interface ExportPacketInput {
  spotRate: number;
  sellerName?: string; // 缺省由后端按系统设置的公司名称填入
  buyerName: string;
  packageKind: string;
  tradeTerm: string;
  documentDate: string;
  priceOverrides?: Array<{ packingItemId: string; unitPriceUsd: number }>;
}

export interface ExportPacketIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  packingItemId?: string | null;
  productName?: string;
}

export interface ExportPacketLine {
  index: number;
  packingItemId: string;
  productId: string;
  productName: string;
  specification: string;
  declaration: string;
  origin: string;
  hsCode: string;
  refundRate: number | null;
  quantity: number;
  unit: string;
  boxes: number;
  grossWeight: number;
  netWeight: number;
  volume: number;
  storeName: string;
  purchaseCostCny: number;
  unitPriceUsd: number;
  totalUsd: number;
  rawUnitPriceUsd: number;
  rawTotalUsd: number;
  targetMarkup: number;
  realizedMarkup: number | null;
  pricingSource: "formula" | "history" | "manual";
  pricingReference: string;
  roundingMethod: string;
  rejectedHistoricalQuote?: {
    contractNo: string;
    unitPriceUsd: number;
    realizedMarkup: number;
    reason: string;
  } | null;
  issues: ExportPacketIssue[];
}

export interface ExportPacketPreview {
  contractId: string;
  contractNo: string;
  sellerName: string;
  buyerName: string;
  packageKind: string;
  documentDate: string;
  portName: string;
  currency: "USD";
  tradeTerm: string;
  ready: boolean;
  pricingPolicy: {
    spotRate: number;
    fxBuffer: number;
    effectiveRate: number;
    defaultMarkup: number;
    historyRule: string;
  };
  issues: ExportPacketIssue[];
  lines: ExportPacketLine[];
  summary: {
    lineCount: number;
    boxes: number;
    grossWeight: number;
    netWeight: number;
    volume: number;
    totalUsd: number;
    purchaseCostCny: number;
    noRefundLineCount: number;
    errorCount: number;
    warningCount: number;
    revenueCny: number;
    grossProfitCny: number;
    costMarkupRate: number | null;
    salesGrossMarginRate: number | null;
  };
}

export interface ExcelPacketInput extends Partial<ExportPacketInput> {
  contractNo?: string;
  sourceVersion?: string;
  packetVersion?: string;
}

export interface ExcelPacketPreview {
  contracts: Array<{ contractNo: string; rowCount: number }>;
  selectedContractNo: string | null;
  sourceVersion: string;
  packetVersion?: string;
  excludedRows: Array<{
    sourceRow: number;
    productName: string;
    broker: string;
  }>;
  taxVersion: string;
  input: ExportPacketInput;
  packet: ExportPacketPreview | null;
}

const excelFormData = (file: File, input: ExcelPacketInput) => {
  const data = new FormData();
  data.append("file", file);
  data.append("options", JSON.stringify(input));
  return data;
};

export interface GeneratedExportPacket {
  packet: ExportPacketPreview;
  file: {
    id: string;
    fileName: string;
    fileSize: number;
    uploadedAt: string;
  };
}

export const exportPacketService = {
  previewExcel: async (
    file: File,
    input: ExcelPacketInput,
    signal?: AbortSignal,
  ) =>
    api.post<
      ApiResponse<ExcelPacketPreview>,
      ApiResponse<ExcelPacketPreview>,
      FormData
    >("/sales/export-packet/excel/preview", excelFormData(file, input), {
      signal,
      headers: { "Content-Type": "multipart/form-data" },
    }),

  generateExcel: async (
    file: File,
    input: ExcelPacketInput,
    signal?: AbortSignal,
  ) => {
    try {
      const blob = await api.post<Blob, Blob, FormData>(
        "/sales/export-packet/excel/generate",
        excelFormData(file, input),
        {
          responseType: "blob",
          signal,
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      if (!(blob instanceof Blob) || blob.size === 0 || /json/i.test(blob.type))
        throw new Error("四单文件内容不可用，请重新生成");
      return blob;
    } catch (error: unknown) {
      const data =
        error instanceof Blob
          ? error
          : error && typeof error === "object" && "response" in error
            ? (error as { response?: { data?: unknown } }).response?.data
            : undefined;
      if (data instanceof Blob && data.size <= 4096) {
        const body = await data.text();
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.message === "string")
            throw new Error(parsed.message);
        } catch (parsedError) {
          if (!(parsedError instanceof SyntaxError)) throw parsedError;
        }
      }
      throw error;
    }
  },

  preview: async (salesContractId: string, input: ExportPacketInput) =>
    api.post<
      ApiResponse<ExportPacketPreview>,
      ApiResponse<ExportPacketPreview>,
      ExportPacketInput
    >(`/sales/${salesContractId}/export-packet/preview`, input),

  generate: async (salesContractId: string, input: ExportPacketInput) =>
    api.post<
      ApiResponse<GeneratedExportPacket>,
      ApiResponse<GeneratedExportPacket>,
      ExportPacketInput
    >(`/sales/${salesContractId}/export-packet/generate`, input),

  download: async (fileId: string, fileName: string) => {
    const response = await fetch(`/api/v1/files/${fileId}/download`, {
      ...authFetchInit(),
    });
    await downloadResponseBlob(response, fileName);
  },
};
