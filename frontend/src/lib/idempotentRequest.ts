type IdempotentCacheEntry = {
  promise?: Promise<unknown>;
  value?: unknown;
  hasValue: boolean;
  expiresAt: number;
};

const defaultWindowMs = 10_000;
const inFlightCache = new Map<string, IdempotentCacheEntry>();

const sortObjectKeys = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  const sortedEntries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => [
      key,
      sortObjectKeys((value as Record<string, unknown>)[key]),
    ]);

  return Object.fromEntries(sortedEntries);
};

const isFresh = (entry?: IdempotentCacheEntry) =>
  entry && entry.expiresAt > Date.now();

const buildCacheKey = (input: unknown): string => {
  if (typeof input === "string") {
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
      inFlightCache.set(key, {
        hasValue: true,
        value,
        promise: undefined,
        expiresAt: Date.now() + ttlMs,
      });
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

/**
 * HTTP headers must contain only ByteString characters. Hash the complete JSON
 * payload, rather than placing notes/customer names in headers or truncating them.
 * Web Crypto requires HTTPS (or localhost); never fall back to a weak hash.
 */
export const buildIdempotencyKey = async (value: unknown): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("无法生成安全请求标识，请使用 HTTPS 或更新浏览器后重试");
  }
  // Match JSON wire semantics (dates, omitted undefined fields), then sort keys.
  // Invalid/non-JSON inputs must fail instead of collapsing to "[object Object]".
  const serialized = JSON.stringify(
    sortObjectKeys(JSON.parse(JSON.stringify(value))),
  );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `idempotency:sha256:${hex}`;
};
