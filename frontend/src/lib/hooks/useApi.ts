"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { runAwaitResult } from "@/lib/run-await";

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

  // 最新 request 原先在渲染期写入 ref，改为每次提交后（layout 阶段，早于任何被动 effect 与事件）写入。
  useLayoutEffect(() => {
    requestRef.current = request;
  });

  // 渲染期已重置、对应被动 effect 尚未执行的窗口内完成的旧请求：原 effect 会随后覆盖 loading/error，
  // 因此窗口内跳过这两项写入（data/hasLoaded 与回调不受影响，与原先一致）。
  const resetPendingRef = useRef(false);

  const runRequest = useCallback(
    (args: TArgs): Promise<TResult | null> =>
      runAwaitResult<TResult, TResult | null>(
        () => requestRef.current(...args),
        (result) => {
          setData(result);
          setHasLoaded(true);
          onSuccess?.(result);
          return result;
        },
        (err) => {
          const message = normalizeErrorMessage(err);
          if (!resetPendingRef.current) setError(message);
          setHasLoaded(true);
          onError?.(err);
          return null;
        },
        () => {
          if (!resetPendingRef.current) setLoading(false);
        },
      ),
    [onError, onSuccess],
  );

  const execute = useCallback(
    (...args: TArgs): Promise<TResult | null> => {
      setLoading(true);
      setError(null);
      return runRequest(args);
    },
    [runRequest],
  );

  // immediate 请求的 loading/error 置位：原先在 effect 内（execute 开头）同步写入，改为渲染期执行；
  // 挂载时初值即为 loading=immediate、error=null，无需写入。
  // 以 runRequest 的依赖（onError、onSuccess）判断其是否变化，与原 effect 的触发条件一致。
  const [immediateKey, setImmediateKey] = useState({
    immediate,
    onError,
    onSuccess,
  });
  if (
    immediateKey.immediate !== immediate ||
    immediateKey.onError !== onError ||
    immediateKey.onSuccess !== onSuccess
  ) {
    setImmediateKey({ immediate, onError, onSuccess });
    if (immediate) {
      setLoading(true);
      setError(null);
    }
  }
  useLayoutEffect(() => {
    resetPendingRef.current = immediate;
  }, [immediate, runRequest]);

  useEffect(() => {
    resetPendingRef.current = false;
    if (immediate) {
      void runRequest([] as unknown as TArgs);
    }
  }, [immediate, runRequest]);

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
