import type {
  CustomsDeclaration,
  CustomsDeclarationItem,
} from '@/types';
import { createCrudService } from './crudService';

export type CustomsDeclarationListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
};

export type CustomsDeclarationItemInput = Omit<CustomsDeclarationItem, 'id'>;

export type CustomsDeclarationUpsertInput = Omit<
  CustomsDeclaration,
  'id' | 'createdAt' | 'updatedAt' | 'items'
> & {
  items: CustomsDeclarationItemInput[];
};

const crud = createCrudService<
  CustomsDeclaration,
  CustomsDeclarationUpsertInput,
  CustomsDeclarationUpsertInput,
  CustomsDeclarationListQuery
>('/customs-declarations');

export const customsDeclarationService = {
  ...crud,
  getAll: async (params?: CustomsDeclarationListQuery) =>
    crud.getAll!(params as CustomsDeclarationListQuery),
  getById: async (id: string) => crud.getById!(id),
  create: async (data: CustomsDeclarationUpsertInput) => crud.create!(data),
  update: async (id: string, data: CustomsDeclarationUpsertInput) =>
    crud.update!(id, data),
  delete: async (id: string) => crud.delete!(id),
};
