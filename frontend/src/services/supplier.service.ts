import type { Supplier } from '@/types';
import { createCrudService } from './crudService';

type SupplierListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  query?: string;
};

const normalizeSupplierListParams = (params?: SupplierListQuery) => {
  if (!params) {
    return {};
  }
  const { query, ...rest } = params;
  return {
    ...rest,
    ...(query !== undefined ? { keyword: query } : {}),
  };
};

/**
 * 供应商服务。
 * - 外部可继续传 query
 * - 后端实际透传 keyword 查询
 */
const crud = createCrudService<Supplier, Partial<Supplier>, Partial<Supplier>, Omit<SupplierListQuery, 'query'>>('/suppliers');

export const supplierService = {
  ...crud,
  getAll: async (params?: SupplierListQuery) => {
    return crud.getAll?.(normalizeSupplierListParams(params) as Omit<SupplierListQuery, 'query'>);
  },
};
