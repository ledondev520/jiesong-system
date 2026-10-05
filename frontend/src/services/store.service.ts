import type { ApiResponse, Store } from "@/types";
import api, { type ApiRequestConfig } from "@/lib/axios";
import { createCrudService } from "./crudService";

type StoreListQuery = {
  page?: number;
  pageSize?: number;
  lite?: boolean;
};

const crud = createCrudService<
  Store,
  Partial<Store>,
  Partial<Store>,
  StoreListQuery
>("/stores");

/**
 * 门店服务（列表查询、详情、增删改及创建时的实时可用港口）。
 */
export const storeService = {
  ...crud,
  getPorts: () =>
    api.get<
      ApiResponse<NonNullable<Store["port"]>[]>,
      ApiResponse<NonNullable<Store["port"]>[]>
    >("/stores/options/ports", {
      cache: { enabled: false },
    } as ApiRequestConfig),
};

/**
 * 保留显式返回类型，供服务测试与调用方类型推断使用。
 */
type StoreService = typeof storeService;
