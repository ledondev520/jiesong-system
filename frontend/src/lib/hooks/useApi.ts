'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AsyncFunction<TArgs extends readonly unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

export interface UseApiOptions<TResult> {
  immediate?: boolean;
  initialData?: TResult;
  onSuccess?: (data: TResult) => void;
  onError?: (error: unknown) => void;
}

export interface UseApiState<TResult> {
  data: TResult | undefined;
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  execute: (...args: Parameters<AsyncFunction<unknown[], TResult>>) => Promise<TResult | null>;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '请求失败';
}

export function useApi<TResult, TArgs extends readonly unknown[] = []>(
  request: AsyncFunction<TArgs, TResult>,
  options: UseApiOptions<TResult> = {},
): UseApiState<TResult> {
  const { immediate = false, initialData, onSuccess, onError } = options;

  const [data, setData] = useState<TResult | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(immediate);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestRef = useRef(request);

  requestRef.current = request;

  const execute = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await requestRef.current(...args);
      setData(result);
      setHasLoaded(true);
      onSuccess?.(result);
      return result;
    } catch (err) {
      const message = normalizeErrorMessage(err);
      setError(message);
      setHasLoaded(true);
      onError?.(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [onError, onSuccess]);

  useEffect(() => {
    if (immediate) {
      void execute();
    }
  }, [immediate, execute]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      hasLoaded,
      execute,
    }),
    [data, loading, error, hasLoaded, execute],
  );
}
