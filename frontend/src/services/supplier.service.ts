import type { Supplier } from '@/types';
import { createCrudService } from './crudService';

type SupplierListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
};

type SupplierUpsertInput = Omit<Partial<Supplier>, 'aliases'> & {
  aliases?: Array<{ alias: string }>;
};

/**
 * 供应商服务。
 */
const crud = createCrudService<Supplier, SupplierUpsertInput, SupplierUpsertInput, SupplierListQuery>('/suppliers');

export const supplierService = {
  ...crud,
  getAll: async (params?: SupplierListQuery) => crud.getAll?.(params),
};
