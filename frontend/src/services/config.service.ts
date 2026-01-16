import api from '@/lib/axios';
import { ApiResponse } from '@/types';

export const configService = {
  getSystemConfig: async () => {
    // Returns { exchangeRate: number, profitRate: number, ... }
    return api.get<any, ApiResponse<any>>('/config/system');
  },

  updateSystemConfig: async (data: any) => {
    return api.put<any, ApiResponse<any>>('/config/system', data);
  },

  getUnits: async () => {
    return api.get<any, ApiResponse<string[]>>('/config/units');
  },

  addUnit: async (unit: string) => {
    return api.post<any, ApiResponse<void>>('/config/units', { unit });
  },

  deleteUnit: async (unit: string) => {
    return api.delete<any, ApiResponse<void>>(`/config/units/${encodeURIComponent(unit)}`);
  },
  
  getCustomsBrokers: async () => {
    return api.get<any, ApiResponse<string[]>>('/config/brokers');
  }
};
