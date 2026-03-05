type IdempotentCacheEntry = {
  promise?: Promise<unknown>;
  value?: unknown;
  hasValue: boolean;
  expiresAt: number;
};

const defaultWindowMs = 10_000;
const inFlightCache = new Map<string, IdempotentCacheEntry>();

const sortObjectKeys = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  const sortedEntries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => [key, sortObjectKeys((value as Record<string, unknown>)[key])]);

  return Object.fromEntries(sortedEntries);
};

const isFresh = (entry?: IdempotentCacheEntry) => entry && entry.expiresAt > Date.now();

const buildCacheKey = (input: unknown): string => {
  if (typeof input === 'string') {
    return input;
  }

  try {
    return JSON.stringify(sortObjectKeys(input));
  } catch {
    return String(input);
  }
};

/**
 * 将同一幂等键的并发请求进行共享，避免重复提交。
 */
export const runIdempotentRequest = async <T>(
  rawKey: string | unknown,
  runner: () => Promise<T>,
  options?: { ttlMs?: number },
): Promise<T> => {
  const ttlMs = options?.ttlMs ?? defaultWindowMs;
  const key = buildCacheKey(rawKey);
  const now = Date.now();
  const cached = inFlightCache.get(key);

  if (cached) {
    if (cached.promise) {
      return cached.promise as Promise<T>;
    }

    if (cached.hasValue && isFresh(cached)) {
      return Promise.resolve(cached.value as T);
    }

    if (!isFresh(cached)) {
      inFlightCache.delete(key);
    }
  }

  const promise = runner()
    .then((value) => {
      inFlightCache.set(key, { hasValue: true, value, promise: undefined, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      inFlightCache.delete(key);
      throw error;
    });

  inFlightCache.set(key, {
    hasValue: false,
    value: undefined,
    promise,
    expiresAt: now + ttlMs,
  });

  return promise;
};

export const buildIdempotencyKey = (value: unknown): string => {
  return `idempotency:${buildCacheKey(value)}`;
};
