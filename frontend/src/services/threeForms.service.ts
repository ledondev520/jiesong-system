/**
 * Input: 三张表生成参数、共享 Axios 认证传输与真实二进制响应
 * Output: 报关、核销、退税单生成及保留响应文件名和 Blob 字节的下载
 * Pos: 出口三表联动生成服务层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api, { type ApiRequestConfig } from "@/lib/axios";
import { saveBlobToFile } from "./fileDownload";
import type { ApiResponse } from "@/types";

export interface ThreeFormsGenerateInput {
  salesContractId: string;
  items: {
    productName: string;
    hsCode: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    totalPrice: number;
    refundRate?: number;
    packingItemId?: string;
    productId?: string;
    hsSource?: "stored" | "history" | "ai" | "manual" | "missing";
  }[];
  extraData?: {
    customs?: {
      exporter?: string;
      consignee?: string;
      destinationCountry?: string;
      portOfLoading?: string;
      portOfDestination?: string;
      transportMode?: string;
      note?: string;
    };
    forex?: {
      bankName?: string;
      note?: string;
    };
    taxRefund?: {
      note?: string;
    };
  };
  generateCustoms?: boolean;
  generateForex?: boolean;
  generateTaxRefund?: boolean;
}

export interface ThreeFormsGenerateResult {
  customsDeclarationId: string | null;
  forexId: string | null;
  taxRefundId: string | null;
  warnings?: ExportReadinessIssue[];
}

export interface ExportReadinessIssue {
  code: string;
  severity: "error" | "warning";
  scope: "all" | "customs" | "tax_refund";
  message: string;
  packingItemId?: string;
  productName?: string;
}

export interface ExportReadinessLine {
  packingItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  hsCode: string;
  hsSource:
    | "customs_history"
    | "product_archive"
    | "packing_confirmation"
    | "manual_confirmation"
    | "missing";
  hsEvidence: {
    productName: string;
    refundRate: number | null;
    vatRate: number | null;
    effectiveDate: string | null;
    fetchedAt: string | null;
    sourceUrl: string | null;
  } | null;
  declarationElements: string;
  origin?: string;
  declarationTemplate: string;
  unitPriceUsd: number;
  totalPriceUsd: number;
  storedTotalPriceUsd: number;
  recommendedUnitPriceUsd: number | null;
  pricingFormula: string;
  pricingProfitRate: number;
  exchangeRate: number;
  purchaseCostCny: number;
  purchaseVatRate: number | null;
  refundBaseCny: number;
  estimatedRefundCny: number;
  nonRefundableInputTaxCny: number;
  issues: ExportReadinessIssue[];
}

export interface ExportReadinessResult {
  contractId: string;
  contractNo: string;
  exchangeRate: number;
  profitRate: number;
  customsReady: boolean;
  taxRefundReady: boolean;
  lines: ExportReadinessLine[];
  issues: ExportReadinessIssue[];
  summary: {
    lineCount: number;
    totalExportAmountUsd: number;
    storedContractTotalUsd: number;
    totalPurchaseCostCny: number;
    totalRefundBaseCny: number;
    totalEstimatedRefundCny: number;
    totalNonRefundableInputTaxCny: number;
    noRefundLineCount: number;
    errorCount: number;
    warningCount: number;
  };
}

export const threeFormsService = {
  /** 获取不写库的后端权威出口单证准备度。 */
  previewThreeForms: async (
    data: Pick<ThreeFormsGenerateInput, "salesContractId" | "items"> & {
      profitRate?: number;
    },
  ) => {
    return api.post<
      ApiResponse<ExportReadinessResult>,
      ApiResponse<ExportReadinessResult>,
      typeof data
    >("/three-forms/preview", data);
  },

  /**
   * 一键生成三张表
   */
  generateThreeForms: async (data: ThreeFormsGenerateInput) => {
    return api.post<
      ApiResponse<ThreeFormsGenerateResult>,
      ApiResponse<ThreeFormsGenerateResult>,
      ThreeFormsGenerateInput
    >("/three-forms/generate", data);
  },

  /**
   * 单独生成报关单
   */
  generateCustomsDeclaration: async (
    data: Omit<
      ThreeFormsGenerateInput,
      "generateCustoms" | "generateForex" | "generateTaxRefund"
    >,
  ) => {
    return api.post<
      ApiResponse<ThreeFormsGenerateResult>,
      ApiResponse<ThreeFormsGenerateResult>
    >("/three-forms/customs-declaration", data);
  },

  /**
   * 单独生成外汇核销单
   */
  generateForexVerification: async (data: {
    salesContractId: string;
    customsDeclarationId: string;
    extraData?: {
      bankName?: string;
      note?: string;
    };
  }) => {
    return api.post<
      ApiResponse<ThreeFormsGenerateResult>,
      ApiResponse<ThreeFormsGenerateResult>
    >("/three-forms/forex-verification", data);
  },

  /**
   * 下载三张表 Excel 文件
   * 职责：使用共享认证传输下载当前三表的原始 Blob 和响应文件名
   * 思路：在 Axios 解包前提取响应头，禁止 JSON 缓存，再保存返回的完整 Blob。
   * @param salesContractId 合同 ID
   * @param ids 可选，精确指定三张表 ID
   * @returns 下载触发完成的 Promise
   * @throws HTTP 请求失败或浏览器文件保存失败
   */
  downloadExcel: async (
    salesContractId: string,
    ids?: {
      customsDeclarationId?: string;
      forexId?: string;
      taxRefundId?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (ids?.customsDeclarationId)
      params.set("customsDeclarationId", ids.customsDeclarationId);
    if (ids?.forexId) params.set("forexId", ids.forexId);
    if (ids?.taxRefundId) params.set("taxRefundId", ids.taxRefundId);

    const qs = params.toString() ? `?${params.toString()}` : "";
    let cd = "";
    const blob = await api.get<Blob, Blob>(
      `/three-forms/export/${salesContractId}${qs}`,
      {
        responseType: "blob",
        cache: { enabled: false },
        // The shared response interceptor returns data, not AxiosResponse.
        transformResponse: [
          (data, headers) => {
            cd = String(headers["content-disposition"] || "");
            return data;
          },
        ],
      } as ApiRequestConfig,
    );

    // 从 Content-Disposition 提取文件名，或使用默认名
    const match = cd.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
    const filename = match
      ? decodeURIComponent(match[1].replace(/"/g, ""))
      : `三张表_${salesContractId}.xlsx`;

    saveBlobToFile(blob, filename);
  },

  /**
   * 单独生成出口退税单
   */
  generateTaxRefund: async (data: {
    salesContractId: string;
    customsDeclarationId: string;
    forexVerificationId: string;
    items: {
      productName: string;
      hsCode: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      totalPrice: number;
      refundRate?: number;
    }[];
  }) => {
    return api.post<
      ApiResponse<ThreeFormsGenerateResult>,
      ApiResponse<ThreeFormsGenerateResult>
    >("/three-forms/tax-refund", data);
  },
};
