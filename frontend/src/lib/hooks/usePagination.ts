'use client';

import { useCallback, useMemo, useState } from 'react';

export interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

export interface UsePaginationResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  start: number;
  end: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  reset: () => void;
  isFirstPage: boolean;
  isLastPage: boolean;
}

export function usePagination(
  totalItems = 0,
  options: UsePaginationOptions = {},
): UsePaginationResult {
  const { pageSize: initialPageSize = 20, initialPage = 1 } = options;
  const [pageSize, setPageSize] = useState<number>(Math.max(1, Math.floor(initialPageSize)));
  const [page, setPageState] = useState<number>(Math.max(1, Math.floor(initialPage)));

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const setPage = useCallback(
    (nextPage: number) => {
      if (!Number.isFinite(nextPage)) {
        return;
      }
      const value = Math.max(1, Math.min(totalPages, Math.floor(nextPage)));
      setPageState(value);
    },
    [totalPages],
  );

  const updatePageSize = useCallback((nextPageSize: number) => {
    const safePageSize = Math.max(1, Math.floor(nextPageSize || 1));
    setPageSize(safePageSize);
    setPageState(1);
  }, []);

  const reset = useCallback(() => {
    setPageState(1);
    setPageSize(initialPageSize);
  }, [initialPageSize]);

  const nextPage = useCallback(() => {
    setPage(page + 1);
  }, [page, setPage]);

  const prevPage = useCallback(() => {
    setPage(page - 1);
  }, [page, setPage]);

  const start = useMemo(() => (page - 1) * pageSize, [page, pageSize]);
  const end = useMemo(() => Math.min(start + pageSize, totalItems), [start, pageSize, totalItems]);

  return {
    page,
    pageSize,
    total: totalItems,
    totalPages,
    start,
    end,
    setPage,
    setPageSize: updatePageSize,
    nextPage,
    prevPage,
    reset,
    isFirstPage: page <= 1,
    isLastPage: page >= totalPages,
  };
}
