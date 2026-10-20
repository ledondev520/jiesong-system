"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AsyncFunction<TArgs extends readonly unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

export interface UseApiOptions<TResult> {
  immediate?: boolean;
  initialData?: TResult;
  onSuccess?: (data: TResult) => void;
  onError?: (error: unknown) => void;
}

export interface UseApiState<TResult, TArgs extends readonly unknown[]> {
  data: TResult | undefined;
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  execute: (...args: TArgs) => Promise<TResult | null>;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "请求失败";
}

export function useApi<TResult, TArgs extends readonly unknown[] = []>(
  request: AsyncFunction<TArgs, TResult>,
  options: UseApiOptions<TResult> = {},
): UseApiState<TResult, TArgs> {
  const { immediate = false, initialData, onSuccess, onError } = options;

  const [data, setData] = useState<TResult | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(immediate);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestRef = useRef(request);

  // react-hooks/refs 警告保留：最新 request 必须在渲染期写入 ref。改为 layout/被动 effect 写入后，子组件 layout effect、
  // 渲染期或挂起 transition 提交前调用 execute 会改用上一次提交的 request（B11 第 1 轮复审实测），属行为变化，故不改。
  requestRef.current = request;

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
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
    },
    [onError, onSuccess],
  );

  // react-hooks/set-state-in-effect 警告保留：每次自动请求开始前须同步置 loading=true、error=null（含 StrictMode/重放 effect
  // 的第二次 setup，此时依赖未变，渲染期重置无法覆盖）；按 onSuccess/onError 引用做渲染期重置还会让内联回调无限重渲染
  // （B11 第 1 轮复审实测），故保持原 effect 内调用 execute。
  useEffect(() => {
    if (immediate) {
      void execute(...([] as unknown as TArgs));
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
