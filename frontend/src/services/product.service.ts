import type { Product } from '@/types';
import { createCrudService } from './crudService';

type ProductListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
};

const crud = createCrudService<Product, Partial<Product>, Partial<Product>, ProductListQuery>('/products');
export const productService = {
  ...crud,
  getAll: async (params?: ProductListQuery) => crud.getAll?.(params as ProductListQuery),
};
