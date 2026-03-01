'use client';

import { useMemo } from 'react';
import { usePagination } from '@/lib/hooks/usePagination';

export interface UseDataTableOptions<TItem> {
  data: TItem[];
  pageSize?: number;
  filter?: (item: TItem) => boolean;
  sort?: ((a: TItem, b: TItem) => number) | null;
  initialPage?: number;
}

export interface UseDataTableResult<TItem> {
  records: TItem[];
  filtered: TItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  start: number;
  end: number;
}

export function useDataTable<TItem>(options: UseDataTableOptions<TItem>): UseDataTableResult<TItem> {
  const { data, pageSize = 20, filter, sort, initialPage = 1 } = options;

  const normalizedData = useMemo(() => {
    let items = data;
    if (filter) {
      items = items.filter(filter);
    }
    if (sort) {
      items = [...items].sort(sort);
    }
    return items;
  }, [data, filter, sort]);

  const pagination = usePagination(normalizedData.length, {
    pageSize,
    initialPage,
  });

  const pageRows = useMemo(() => {
    return normalizedData.slice(pagination.start, pagination.end);
  }, [pagination.end, pagination.start, normalizedData]);

  return {
    records: pageRows,
    filtered: normalizedData,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    totalPages: pagination.totalPages,
    setPage: pagination.setPage,
    setPageSize: pagination.setPageSize,
    nextPage: pagination.nextPage,
    prevPage: pagination.prevPage,
    start: pagination.start,
    end: pagination.end,
  };
}
