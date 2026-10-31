import api from '@/lib/axios';
import { ApiResponse } from '@/types';

type SystemConfigValue = string | number | boolean | string[] | null;

interface SystemConfig {
  exchangeRate?: number;
  profitRate?: number;
  units?: string[];
  brokers?: string[];
  [key: string]: SystemConfigValue | undefined;
}

const fetchSystemConfig = async () => {
  return api.get<ApiResponse<SystemConfig>, ApiResponse<SystemConfig>>('/system/configs');
};

const toStringArray = (value: unknown, fallback: string[] = []): string[] => {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
};

export interface SellerIdentity {
  name: string;
  address: string;
  phone: string;
  taxId: string;
  /** 银行资料仅 ADMIN/FINANCE 返回，其他角色为空串 */
  bank: string;
  /** 这些字段来自旧的 invoiceTitleInfo（canonical 键尚为空） */
  legacyFilled: Array<'name' | 'address' | 'phone' | 'taxId' | 'bank'>;
  /** 催票等文本用的开票抬头，由统一卖方信息生成 */
  invoiceTitleText: string;
}

export const configService = {
  getSellerIdentity: async () =>
    api.get<ApiResponse<SellerIdentity>, ApiResponse<SellerIdentity>>('/system/seller-identity'),

  getSystemConfig: async () => {
    return fetchSystemConfig();
  },

  updateSystemConfig: async (data: Partial<SystemConfig>) => {
    const entries = Object.entries(data).filter(
      (entry): entry is [string, SystemConfigValue] => entry[1] !== undefined,
    );

    if (entries.length === 0) {
      return fetchSystemConfig();
    }

    await Promise.all(
      entries.map(([key, value]) => api.put<ApiResponse<SystemConfig>, ApiResponse<SystemConfig>, { value: SystemConfigValue }>(
        `/system/configs/${key}`,
        { value }
      ))
    );

    return fetchSystemConfig();
  },

  getUnits: async () => {
    const response = await fetchSystemConfig();
    return {
      ...response,
      data: response.code === 200 ? toStringArray(response.data?.units, []) : [],
    } as ApiResponse<string[]>;
  },

  addUnit: async (unit: string) => {
    const current = await fetchSystemConfig();
    const currentUnits = toStringArray(current.data?.units, []);
    const nextUnits = Array.from(new Set([...currentUnits, unit]));
    const response = await api.put<ApiResponse<SystemConfig>, ApiResponse<SystemConfig>, { value: string[] }>(
      '/system/configs/units',
      { value: nextUnits }
    );
    return {
      ...response,
      data: toStringArray(response.data?.units, nextUnits),
    } as ApiResponse<string[]>;
  },

  deleteUnit: async (unit: string) => {
    const current = await fetchSystemConfig();
    const nextUnits = toStringArray(current.data?.units, []).filter((item) => item !== unit);
    const response = await api.put<ApiResponse<SystemConfig>, ApiResponse<SystemConfig>, { value: string[] }>(
      '/system/configs/units',
      { value: nextUnits }
    );
    return {
      ...response,
      data: toStringArray(response.data?.units, nextUnits),
    } as ApiResponse<string[]>;
  },
  
  getCustomsBrokers: async () => {
    const response = await fetchSystemConfig();
    return {
      ...response,
      data: response.code === 200 ? toStringArray(response.data?.brokers, []) : [],
    } as ApiResponse<string[]>;
  }
};
