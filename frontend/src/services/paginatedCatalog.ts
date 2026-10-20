import type { ApiResponse, PaginatedResponse } from '@/types';

/** 选择器需要完整目录；逐页读取，不能把后端每页上限当成总数。 */
export async function loadPaginatedCatalog<T>(fetchPage: (page: number) => Promise<ApiResponse<PaginatedResponse<T>>>): Promise<T[]> {
  // ponytail: 选择目录全量装入内存；加载时间影响操作时改为服务端搜索。
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetchPage(page);
    items.push(...(response.data?.items ?? []));
    totalPages = response.data?.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return items;
}
