import api from "@/lib/axios";
import type { ApiResponse, Supplier } from "@/types";
import { createCrudService } from "./crudService";

type SupplierListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  lite?: boolean;
  status?: "active" | "archived" | "all";
};

type SupplierUpsertInput = Omit<Partial<Supplier>, "aliases"> & {
  aliases?: Array<{ alias: string }>;
};

/**
 * 供应商服务。
 */
const crud = createCrudService<
  Supplier,
  SupplierUpsertInput,
  SupplierUpsertInput,
  SupplierListQuery
>("/suppliers");

export interface SupplierHardDeletePreview {
  counts: Record<string, number>;
  blockers: string[];
  canDelete: boolean;
  confirmToken: string | null;
}

export const supplierService = {
  ...crud,
  // ADMIN only: preview counts + token, then delete with the matching token (one server transaction).
  hardDeletePreview: (id: string) =>
    api.get<
      ApiResponse<SupplierHardDeletePreview>,
      ApiResponse<SupplierHardDeletePreview>
    >(`/suppliers/${id}/hard-delete-preview`),
  hardDelete: (id: string, confirmToken: string) =>
    api.post<ApiResponse<unknown>, ApiResponse<unknown>>(
      `/suppliers/${id}/hard-delete`,
      { confirmToken },
    ),
  getAll: async (params?: SupplierListQuery) => crud.getAll?.(params),
};
