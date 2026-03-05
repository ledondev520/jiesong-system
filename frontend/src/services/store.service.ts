import type { Store } from '@/types';
import { createCrudService } from './crudService';

export type StoreListQuery = {
  page?: number;
  pageSize?: number;
};

const crud = createCrudService<Store, Partial<Store>, Partial<Store>, StoreListQuery>('/stores');

/**
 * 门店服务（列表查询、详情、增删改）。
 */
export const storeService = {
  ...crud,
};

/**
 * 保留显式返回类型，供服务测试与调用方类型推断使用。
 */
export type StoreService = typeof storeService;
