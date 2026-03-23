/**
 * Input: axios实例
 * Output: 数据导入相关API调用
 * Pos: 前端数据导入服务
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import type { PaginatedResponse } from '@/types';

export interface ImportAnalysis {
  totalRows: number;
  seqRange: { min: number; max: number };
  missingSeqs: number[];
  uniqueSeqs: number;
}

export interface NewRecord {
  seq: string;
  customsName: string;
  storeName: string;
  containerNo: string;
  quantity: number | null;
  data: Record<string, string>;
}

export interface ImportComparison {
  summary: {
    total: number;
    new: number;
    existing: number;
    invalid: number;
  };
  newRecords: NewRecord[];
  existingRecords: Array<{
    seq: string;
    customsName: string;
    containerNo: string;
    data: Record<string, string>;
  }>;
  invalidRecords: Array<{
    seq: string;
    reason: string;
    data: Record<string, string>;
  }>;
}

export interface PreviewResult {
  fileName: string;
  analysis: ImportAnalysis;
  comparison: ImportComparison;
  fullNewRecords: NewRecord[];
}

export interface ImportResult {
  message: string;
  result: {
    success: Array<{ seq: string; customsName: string; storeName: string }>;
    failed: Array<{ seq: string; reason: string }>;
    created: {
      suppliers: number;
      products: number;
      stores: number;
      containers: number;
      salesContracts: number;
      purchaseContracts: number;
      containerItems: number;
      inventories: number;
    };
  };
}

export interface ImportHistory {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  status: string;
  errorLog: string | null;
  importedAt: string;
  importedBy: string;
}

export interface DatabaseStats {
  suppliers: number;
  products: number;
  stores: number;
  containers: number;
  containerItems: number;
  salesContracts: number;
  purchaseContracts: number;
  inventories: number;
}

/**
 * 职责：上传CSV并获取预览结果
 */
export const previewCSV = async (file: File): Promise<PreviewResult> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/import/preview', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return (response as { data: PreviewResult }).data;
};

/**
 * 职责：执行数据导入
 */
export const executeImport = async (records: NewRecord[]): Promise<ImportResult> => {
  const response = await api.post('/import/execute', { records });
  return (response as { data: ImportResult }).data;
};

/**
 * 职责：获取导入历史
 */
export const getImportHistory = async (): Promise<ImportHistory[]> => {
  const response = await api.get('/import/history');
  const data = (response as { data: ImportHistory[] | PaginatedResponse<ImportHistory> }).data;
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data?.items) ? data.items : [];
};

/**
 * 职责：获取数据库统计
 */
export const getDatabaseStats = async (): Promise<DatabaseStats> => {
  const response = await api.get('/import/stats');
  return (response as { data: DatabaseStats }).data;
};
