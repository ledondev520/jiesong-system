/**
 * Input: 合同文档API
 * Output: 合同文档服务方法
 * Pos: 前端服务层，封装合同文档生成相关API调用
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import { ApiResponse } from '@/types';

export const contractDocService = {
  /**
   * 检查模板状态
   */
  checkTemplate: async () => {
    return api.get<ApiResponse<{ exists: boolean }>, ApiResponse<{ exists: boolean }>>('/contract-doc/template/check');
  },

  /**
   * 获取模板列表（当前后端仅支持单模板）
   */
  getTemplates: async () => {
    return api.get<ApiResponse<{ items: Array<{
      exists: boolean;
      filename?: string;
      size?: number;
      updatedAt?: string;
    }> }>, ApiResponse<{ items: Array<{
      exists: boolean;
      filename?: string;
      size?: number;
      updatedAt?: string;
    }> }>>('/contract-doc/templates');
  },

  /**
   * 上传合同模板
   * @param file - Word模板文件
   */
  uploadTemplate: async (file: File) => {
    const formData = new FormData();
    formData.append('template', file);
    return api.post<ApiResponse<void>, ApiResponse<void>, FormData>('/contract-doc/template', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * 删除合同模板
   */
  deleteTemplate: async () => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>('/contract-doc/template');
  },

  /**
   * 根据采购合同生成购销合同文档
   * @param purchaseContractId - 采购合同ID
   * @param options - 附加选项（店铺名称、收货地址等）
   * @returns Blob - 文档Blob
   */
  generateFromPurchase: async (
    purchaseContractId: string,
    options?: {
      storeName?: string;
      deliveryAddress?: string;
      deliveryContact?: string;
    }
  ) => {
    const response = await api.post(
      `/contract-doc/generate/${purchaseContractId}`,
      options || {},
      {
        responseType: 'blob',
      }
    );
    return response as unknown as Blob;
  },

  /**
   * 下载生成的合同文档
   * @param blob - 文档Blob
   * @param filename - 文件名
   */
  downloadDocument: (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * 获取采购合同的PDF文档（用于预览）
   * @param purchaseContractId - 采购合同ID
   * @returns Blob | null - PDF Blob 或 null
   */
  getContractPdf: async (purchaseContractId: string): Promise<Blob | null> => {
    try {
      const response = await api.get(
        `/contract-doc/pdf/${purchaseContractId}`,
        { responseType: 'blob' }
      );
      return response as unknown as Blob;
    } catch {
      return null;
    }
  },
};
