/**
 * Input: 三张表生成参数
 * Output: 报关单、外汇核销单、出口退税单生成服务
 * Pos: 出口三表联动生成服务层
 */

import api from '@/lib/axios';
import type { ApiResponse } from '@/types';

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
}

export const threeFormsService = {
  /**
   * 一键生成三张表
   */
  generateThreeForms: async (data: ThreeFormsGenerateInput) => {
    return api.post<ApiResponse<ThreeFormsGenerateResult>, ApiResponse<ThreeFormsGenerateResult>, ThreeFormsGenerateInput>(
      '/three-forms/generate',
      data,
    );
  },

  /**
   * 单独生成报关单
   */
  generateCustomsDeclaration: async (data: Omit<ThreeFormsGenerateInput, 'generateCustoms' | 'generateForex' | 'generateTaxRefund'>) => {
    return api.post<ApiResponse<ThreeFormsGenerateResult>, ApiResponse<ThreeFormsGenerateResult>>(
      '/three-forms/customs-declaration',
      data,
    );
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
    return api.post<ApiResponse<ThreeFormsGenerateResult>, ApiResponse<ThreeFormsGenerateResult>>(
      '/three-forms/forex-verification',
      data,
    );
  },

  /**
   * 下载三张表 Excel 文件
   * 职责：请求后端生成 Excel 并触发浏览器下载
   * @param salesContractId 合同 ID
   * @param ids 可选，精确指定三张表 ID
   */
  downloadExcel: async (
    salesContractId: string,
    ids?: { customsDeclarationId?: string; forexId?: string; taxRefundId?: string },
  ) => {
    const params = new URLSearchParams();
    if (ids?.customsDeclarationId) params.set('customsDeclarationId', ids.customsDeclarationId);
    if (ids?.forexId) params.set('forexId', ids.forexId);
    if (ids?.taxRefundId) params.set('taxRefundId', ids.taxRefundId);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await api.get(`/three-forms/export/${salesContractId}${qs}`, {
      responseType: 'blob',
    });

    // 从 Content-Disposition 提取文件名，或使用默认名
    const cd = (response.headers as Record<string, string>)['content-disposition'] || '';
    const match = cd.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : `三张表_${salesContractId}.xlsx`;

    const blob = new Blob([response.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
    return api.post<ApiResponse<ThreeFormsGenerateResult>, ApiResponse<ThreeFormsGenerateResult>>(
      '/three-forms/tax-refund',
      data,
    );
  },
};
