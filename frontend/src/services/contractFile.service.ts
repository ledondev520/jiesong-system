/**
 * Input: axios 实例、认证令牌
 * Output: 统一合同附件 API 封装
 * Pos: 合同附件服务层，屏蔽采购/出口合同差异
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import { getAuthToken } from '@/lib/auth-token';
import type { ApiResponse } from '@/types';

export interface ContractFile {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  description?: string | null;
  uploadedAt: string;
  contractType?: 'PURCHASE' | 'SALES';
}

export type ContractType = 'PURCHASE' | 'SALES';

/**
 * 职责：获取合同附件列表
 */
export const listContractFiles = async (contractId: string, contractType: ContractType) => {
  return api.get<ApiResponse<ContractFile[]>, ApiResponse<ContractFile[]>>(
    `/contracts/${contractId}/files`,
    { params: { contractType } }
  );
};

/**
 * 职责：上传合同附件
 */
export const uploadContractFile = async (
  contractId: string,
  contractType: ContractType,
  file: File,
  description?: string
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('contractType', contractType);
  if (description) formData.append('description', description);

  const token = getAuthToken();
  const res = await fetch(`/api/v1/contracts/${contractId}/files`, {
    method: 'POST',
    headers: { Authorization: token ? `Bearer ${token}` : '' },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '上传失败' }));
    throw new Error(err.message || '上传失败');
  }
  return res.json() as Promise<ApiResponse<ContractFile>>;
};

/**
 * 职责：删除合同附件
 */
export const deleteContractFile = async (fileId: string) => {
  return api.delete<ApiResponse<void>, ApiResponse<void>>(`/files/${fileId}`);
};

/**
 * 职责：获取下载链接
 */
export const getContractFileDownloadUrl = (fileId: string) => {
  return `/api/v1/files/${fileId}/download`;
};
