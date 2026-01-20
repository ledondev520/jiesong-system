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
    return api.get<any, ApiResponse<{ exists: boolean }>>('/contract-doc/template/check');
  },

  /**
   * 上传合同模板
   * @param file - Word模板文件
   */
  uploadTemplate: async (file: File) => {
    const formData = new FormData();
    formData.append('template', file);
    return api.post<any, ApiResponse<void>>('/contract-doc/template', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
};
