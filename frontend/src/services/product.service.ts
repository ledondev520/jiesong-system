import type { Product } from '@/types';
import { createCrudService } from './crudService';

type ProductListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  query?: string;
};

const normalizeListParams = (params?: ProductListQuery) => {
  if (!params) {
    return {};
  }
  const { query, ...rest } = params;
  return {
    ...rest,
    ...(query !== undefined ? { keyword: query } : {}),
  };
};

const crud = createCrudService<Product, Partial<Product>, Partial<Product>, Omit<ProductListQuery, 'query'>>('/products');

/**
 * 商品服务。
 * - 保持 query 兼容性，内部统一映射到 keyword
 */
export const productService = {
  ...crud,
  getAll: async (params?: ProductListQuery) => crud.getAll?.(normalizeListParams(params) as Omit<ProductListQuery, 'query'>),
};
