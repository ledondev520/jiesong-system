/**
 * Input: 客户 API（/customers）与门店写入（/stores，沿用现有角色）
 * Output: 客户列表/详情/创建/局部更新、客户下门店读取
 * Pos: 客户与门店页面的服务层；客户只归档（PUT isActive:false），没有删除
 */
import api from "@/lib/axios";
import type { ApiResponse, Customer, PaginatedResponse, Store } from "@/types";

export interface CustomerListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  includeArchived?: boolean;
}

/** 可写字段；null 表示清空可空字段，缺省表示不改（后端 partialUpdate 语义） */
export type CustomerInput = Partial<
  Pick<
    Customer,
    | "name"
    | "legalName"
    | "country"
    | "address"
    | "contactName"
    | "contactEmail"
    | "contactPhone"
    | "defaultIncoterm"
    | "defaultPaymentTerms"
    | "defaultPortOfLoading"
    | "note"
    | "isActive"
  >
>;

export const customerService = {
  getAll: (params?: CustomerListQuery) =>
    api.get<
      ApiResponse<PaginatedResponse<Customer>>,
      ApiResponse<PaginatedResponse<Customer>>
    >("/customers", { params }),
  getById: (id: string) =>
    api.get<ApiResponse<Customer>, ApiResponse<Customer>>(`/customers/${id}`),
  create: (data: CustomerInput) =>
    api.post<ApiResponse<Customer>, ApiResponse<Customer>>("/customers", data),
  update: (id: string, data: CustomerInput) =>
    api.put<ApiResponse<Customer>, ApiResponse<Customer>>(
      `/customers/${id}`,
      data,
    ),
  getStores: (id: string, params?: { includeArchived?: boolean }) =>
    api.get<
      ApiResponse<PaginatedResponse<Store>>,
      ApiResponse<PaginatedResponse<Store>>
    >(`/customers/${id}/stores`, { params: { pageSize: 100, ...params } }),
};

export const INCOTERM_OPTIONS = ["FOB", "CFR", "CIF", "EXW", "DDP"] as const;
