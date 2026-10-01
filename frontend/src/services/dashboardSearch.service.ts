/**
 * Input: 搜索关键字、聚合搜索配置、后端 lite 列表
 * Output: 工作台全局搜索结果与跳转映射
 * Pos: 前端业务服务
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * Note: 货柜管理已并入出口合同（同一数据表），container 类型已移除。
 */

import api from '@/lib/axios';
import type {
  ApiResponse,
  PaginatedResponse,
  Product,
  PurchaseContract,
  SalesContract,
  Supplier,
} from '@/types';

export type DashboardSearchResultType =
  | 'product'
  | 'supplier'
  | 'purchase'
  | 'sales';

export interface DashboardSearchResult {
  type: DashboardSearchResultType;
  id: string;
  title: string;
  subtitle?: string;
}

interface SearchDashboardOptions {
  limit?: number;
}

const emptyPaginatedResponse = <T,>(pageSize: number): ApiResponse<PaginatedResponse<T>> => ({
  code: 200,
  message: 'ok',
  data: {
    items: [],
    pagination: {
      total: 0,
      page: 1,
      pageSize,
      totalPages: 0,
    },
  },
});

const fetchSearchCollection = async <T,>(path: string, query: string, pageSize: number) => {
  return api
    .get<ApiResponse<PaginatedResponse<T>>, ApiResponse<PaginatedResponse<T>>>(path, {
      params: { keyword: query, pageSize, lite: true },
    })
    .catch(() => emptyPaginatedResponse<T>(pageSize));
};

const mapProductResults = (items: Product[]): DashboardSearchResult[] =>
  items.map((product) => ({
    type: 'product',
    id: product.id,
    title: product.customsName,
    subtitle: product.specification || product.unit,
  }));

const mapSupplierResults = (items: Supplier[]): DashboardSearchResult[] =>
  items.map((supplier) => ({
    type: 'supplier',
    id: supplier.id,
    title: supplier.name,
    subtitle: supplier.shortName,
  }));

const mapPurchaseResults = (items: PurchaseContract[]): DashboardSearchResult[] =>
  items.map((purchase) => ({
    type: 'purchase',
    id: purchase.id,
    title: purchase.contractNo,
    subtitle: purchase.supplier?.name || '采购合同',
  }));

const mapSalesResults = (items: SalesContract[]): DashboardSearchResult[] =>
  items.map((sales) => ({
    type: 'sales',
    id: sales.id,
    title: sales.contractNo,
    subtitle: `$${(sales.totalAmount || 0).toLocaleString()}`,
  }));

export const searchDashboard = async (
  query: string,
  options: SearchDashboardOptions = {},
): Promise<DashboardSearchResult[]> => {
  const normalizedQuery = query.trim();
  const limit = Math.max(options.limit ?? 6, 1);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const [productsRes, suppliersRes] = await Promise.all([
    fetchSearchCollection<Product>('/products', normalizedQuery, limit),
    fetchSearchCollection<Supplier>('/suppliers', normalizedQuery, limit),
  ]);

  const initialResults = [
    ...mapProductResults(productsRes.data?.items || []),
    ...mapSupplierResults(suppliersRes.data?.items || []),
  ].slice(0, limit);

  if (initialResults.length >= limit) {
    return initialResults;
  }

  const remaining = limit - initialResults.length;
  const [purchasesRes, salesRes] = await Promise.all([
    fetchSearchCollection<PurchaseContract>('/purchases', normalizedQuery, remaining),
    fetchSearchCollection<SalesContract>('/sales', normalizedQuery, remaining),
  ]);

  return [
    ...initialResults,
    ...mapPurchaseResults(purchasesRes.data?.items || []),
    ...mapSalesResults(salesRes.data?.items || []),
  ].slice(0, limit);
};

export const getDashboardSearchHref = (result: DashboardSearchResult) => {
  switch (result.type) {
    case 'product':
      return `/dashboard/products?keyword=${encodeURIComponent(result.title)}`;
    case 'supplier':
      return `/dashboard/suppliers?keyword=${encodeURIComponent(result.title)}`;
    case 'purchase':
      return `/dashboard/purchase/${result.id}`;
    case 'sales':
      return `/dashboard/sales/${result.id}`;
  }
};
