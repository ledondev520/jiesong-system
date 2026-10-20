import api, { type ApiRequestConfig } from "@/lib/axios";
import { Inventory, ApiResponse, PaginatedResponse } from "@/types";

export const inventoryService = {
  getAll: async (params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    lite?: boolean;
  }) => {
    // 库存由验货与发运实时改变，不复用默认三分钟 GET 缓存。
    const config: ApiRequestConfig = { params, cache: { enabled: false } };
    return api.get<
      ApiResponse<PaginatedResponse<Inventory>>,
      ApiResponse<PaginatedResponse<Inventory>>
    >("/inventory", config);
  },

  updateStatus: async (id: string, status: string) => {
    return api.put<
      ApiResponse<Inventory>,
      ApiResponse<Inventory>,
      { status: string }
    >(`/inventory/${id}/status`, { status });
  },

  batchUpdateStatus: async (ids: string[], status: string) => {
    return api.put<
      ApiResponse<{
        success: number;
        failed: number;
        errors: { id: string; message: string }[];
      }>,
      ApiResponse<{
        success: number;
        failed: number;
        errors: { id: string; message: string }[];
      }>,
      { ids: string[]; status: string }
    >("/inventory/batch-status", { ids, status });
  },
};
