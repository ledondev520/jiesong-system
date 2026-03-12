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
