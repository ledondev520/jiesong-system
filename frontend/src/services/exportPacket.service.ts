/**
 * Input: EXP 编号、本票现汇/买方/包装种类/单证日期及人工确认价格
 * Output: 出口三单只读预检、生成归档和受保护文件下载
 * Pos: 出口三单工作台前端数据 Module
 */

import api from '@/lib/axios';
import { getAuthToken } from '@/lib/auth-token';
import { downloadResponseBlob } from './fileDownload';
import type { ApiResponse } from '@/types';

export interface ExportPacketInput {
  spotRate: number;
  sellerName: string;
  buyerName: string;
  packageKind: string;
  tradeTerm: string;
  documentDate: string;
  priceOverrides?: Array<{ packingItemId: string; unitPriceUsd: number }>;
}

export interface ExportPacketIssue {
  code: string;
  severity: 'error' | 'warning';
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
  pricingSource: 'formula' | 'history' | 'manual';
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
  currency: 'USD';
  tradeTerm: string;
  ready: boolean;
  pricingPolicy: {
    spotRate: number;
    fxBuffer: number;
    effectiveRate: number;
    refundableMarkup: number;
    noRefundMarkupCap: number;
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
  };
}

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
  preview: async (salesContractId: string, input: ExportPacketInput) => api.post<
    ApiResponse<ExportPacketPreview>,
    ApiResponse<ExportPacketPreview>,
    ExportPacketInput
  >(`/sales/${salesContractId}/export-packet/preview`, input),

  generate: async (salesContractId: string, input: ExportPacketInput) => api.post<
    ApiResponse<GeneratedExportPacket>,
    ApiResponse<GeneratedExportPacket>,
    ExportPacketInput
  >(`/sales/${salesContractId}/export-packet/generate`, input),

  download: async (fileId: string, fileName: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/files/${fileId}/download`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await downloadResponseBlob(response, fileName);
  },
};
