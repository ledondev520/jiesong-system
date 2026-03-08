import api from '@/lib/axios';
import type { ApiResponse, PaginatedResponse } from '@/types';

export type QueryDictionary = Record<string, unknown>;
export type CrudServiceResponse<T> = Promise<ApiResponse<T>>;

export interface CrudServiceOptions {
  /**
   * 启用/停用标准 CRUD 接口，默认全量开启。
   */
  methods?: {
    getAll?: boolean;
    getById?: boolean;
    create?: boolean;
    update?: boolean;
    delete?: boolean;
  };
}

export interface CrudServiceDefinition<
  TItem,
  TCreateInput,
  TUpdateInput,
  TListQuery extends QueryDictionary,
> {
  getAll?: (params?: TListQuery) => CrudServiceResponse<PaginatedResponse<TItem>>;
  getById?: (id: string) => CrudServiceResponse<TItem>;
  create?: (data: TCreateInput) => CrudServiceResponse<TItem>;
  update?: (id: string, data: TUpdateInput) => CrudServiceResponse<TItem>;
  delete?: (id: string) => CrudServiceResponse<void>;
}

export interface EnabledCrudServiceDefinition<
  TItem,
  TCreateInput,
  TUpdateInput,
  TListQuery extends QueryDictionary,
> {
  getAll: (params?: TListQuery) => CrudServiceResponse<PaginatedResponse<TItem>>;
  getById: (id: string) => CrudServiceResponse<TItem>;
  create: (data: TCreateInput) => CrudServiceResponse<TItem>;
  update: (id: string, data: TUpdateInput) => CrudServiceResponse<TItem>;
  delete: (id: string) => CrudServiceResponse<void>;
}

/**
 * 生成统一 CRUD 调用模板，减少服务层重复样板代码。
 * @param basePath - 接口前缀，示例：'/users'
 * @param options - 默认开启/关闭标准方法
 */
/**
 * 生成统一 CRUD 请求封装，减少服务层手写重复样板。
 *
 * @param basePath 接口基路径，例如 `/users`
 * @param options 需要开启的接口方法（默认全部开启）
 * @returns 带有标准 CRUD 方法的服务实例
 */
export function createCrudService<
  TItem,
  TCreateInput = Partial<TItem>,
  TUpdateInput = Partial<TCreateInput>,
  TListQuery extends QueryDictionary = QueryDictionary
>(
  basePath: string,
): EnabledCrudServiceDefinition<TItem, TCreateInput, TUpdateInput, TListQuery>;

export function createCrudService<
  TItem,
  TCreateInput = Partial<TItem>,
  TUpdateInput = Partial<TCreateInput>,
  TListQuery extends QueryDictionary = QueryDictionary
>(
  basePath: string,
  options: CrudServiceOptions,
): CrudServiceDefinition<TItem, TCreateInput, TUpdateInput, TListQuery>;

export function createCrudService<
  TItem,
  TCreateInput = Partial<TItem>,
  TUpdateInput = Partial<TCreateInput>,
  TListQuery extends QueryDictionary = QueryDictionary
>(
  basePath: string,
  options: CrudServiceOptions = {},
): CrudServiceDefinition<TItem, TCreateInput, TUpdateInput, TListQuery> {
  const normalizedBasePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const methods = {
    getAll: true,
    getById: true,
    create: true,
    update: true,
    delete: true,
    ...options.methods,
  };

  const service: CrudServiceDefinition<TItem, TCreateInput, TUpdateInput, TListQuery> = {};

  if (methods.getAll) {
    service.getAll = async (params?: TListQuery) => {
      return api.get<ApiResponse<PaginatedResponse<TItem>>, ApiResponse<PaginatedResponse<TItem>>>(
        normalizedBasePath,
        params ? { params } : undefined,
      );
    };
  }

  if (methods.getById) {
    service.getById = async (id: string) => {
      return api.get<ApiResponse<TItem>, ApiResponse<TItem>>(`${normalizedBasePath}/${id}`);
    };
  }

  if (methods.create) {
    service.create = async (data: TCreateInput) => {
      return api.post<ApiResponse<TItem>, ApiResponse<TItem>, TCreateInput>(
        normalizedBasePath,
        data
      );
    };
  }

  if (methods.update) {
    service.update = async (id: string, data: TUpdateInput) => {
      return api.put<ApiResponse<TItem>, ApiResponse<TItem>, TUpdateInput>(
        `${normalizedBasePath}/${id}`,
        data
      );
    };
  }

  if (methods.delete) {
    service.delete = async (id: string) => {
      return api.delete<ApiResponse<void>, ApiResponse<void>>(`${normalizedBasePath}/${id}`);
    };
  }

  return service;
}
