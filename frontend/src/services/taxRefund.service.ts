import api from '@/lib/axios';
import type { TaxRefund } from '@/types';
import { createCrudService } from './crudService';

export type TaxRefundListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  salesContractId?: string;
};

export type TaxRefundDraftGenerateInput = {
  customsDeclarationId?: string;
  salesContractId?: string;
  replaceExisting?: boolean;
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
  generateDrafts: async (data: TaxRefundDraftGenerateInput) => api.post('/tax-refunds/auto-drafts', data),
};
