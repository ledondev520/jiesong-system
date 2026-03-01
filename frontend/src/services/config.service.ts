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

export const configService = {
  getSystemConfig: async () => {
    // Returns { exchangeRate: number, profitRate: number, ... }
    return api.get<ApiResponse<SystemConfig>, ApiResponse<SystemConfig>>('/config/system');
  },

  updateSystemConfig: async (data: Partial<SystemConfig>) => {
    return api.put<ApiResponse<SystemConfig>, ApiResponse<SystemConfig>, Partial<SystemConfig>>('/config/system', data);
  },

  getUnits: async () => {
    return api.get<ApiResponse<string[]>, ApiResponse<string[]>>('/config/units');
  },

  addUnit: async (unit: string) => {
    return api.post<ApiResponse<void>, ApiResponse<void>, { unit: string }>('/config/units', { unit });
  },

  deleteUnit: async (unit: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/config/units/${encodeURIComponent(unit)}`);
  },
  
  getCustomsBrokers: async () => {
    return api.get<ApiResponse<string[]>, ApiResponse<string[]>>('/config/brokers');
  }
};
