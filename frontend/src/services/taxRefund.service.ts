import type { TaxRefund } from '@/types';
import { createCrudService } from './crudService';

export type TaxRefundListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  salesContractId?: string;
};

export type TaxRefundUpsertInput = Omit<
  TaxRefund,
  'id' | 'createdAt' | 'updatedAt'
>;

const crud = createCrudService<
  TaxRefund,
  TaxRefundUpsertInput,
  TaxRefundUpsertInput,
  TaxRefundListQuery
>('/tax-refunds');

export const taxRefundService = {
  ...crud,
  getAll: async (params?: TaxRefundListQuery) => crud.getAll!(params),
  getById: async (id: string) => crud.getById!(id),
  create: async (data: TaxRefundUpsertInput) => crud.create!(data),
  update: async (id: string, data: TaxRefundUpsertInput) => crud.update!(id, data),
  delete: async (id: string) => crud.delete!(id),
};
