import type { Supplier } from '@/types';
import { createCrudService } from './crudService';

type SupplierListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
};

/**
 * 供应商服务。
 */
const crud = createCrudService<Supplier, Partial<Supplier>, Partial<Supplier>, SupplierListQuery>('/suppliers');

export const supplierService = {
  ...crud,
  getAll: async (params?: SupplierListQuery) => crud.getAll?.(params),
};
