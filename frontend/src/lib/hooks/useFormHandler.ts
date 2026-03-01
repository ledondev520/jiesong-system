'use client';

import { useCallback, useState } from 'react';

export interface UseFormHandlerOptions<T> {
  onSubmit: (values: T) => Promise<void> | void;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  mapError?: (error: unknown) => string;
}

export interface UseFormHandlerState {
  isSubmitting: boolean;
  error: string | null;
  submit: (values: unknown) => Promise<void>;
  resetError: () => void;
}

export function useFormHandler<T>(options: UseFormHandlerOptions<T>): UseFormHandlerState {
  const { onSubmit, onSuccess, onError, mapError } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (values: unknown) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(values as T);
      onSuccess?.();
    } catch (err: unknown) {
      const message = mapError
        ? mapError(err)
        : err instanceof Error
          ? err.message
          : '提交失败';

      setError(message);
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [onError, onSuccess, onSubmit, mapError]);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isSubmitting,
    error,
    submit,
    resetError,
  };
}
