import { getAuthToken } from "@/lib/auth-token";

/** Browser-session CSRF and auth generation stay in memory; subscribers discard sensitive file views on identity changes. */
let csrf: string | null = null;
export const getBrowserCsrf = (): string | null => csrf;
export const setBrowserCsrf = (value: string | null): void => {
  csrf = value;
};
export const getBrowserSessionHeaders = (): Record<string, string> =>
  csrf ? { "X-CSRF-Token": csrf } : {};

/** Raw fetch init for authed downloads: Bearer only when a token exists (an empty Authorization header is a 401), cookie session otherwise. */
export const authFetchInit = (): RequestInit => {
  const token = getAuthToken();
  return {
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...getBrowserSessionHeaders(),
    },
  };
};

let generation = 0;
const generationListeners = new Set<() => void>();
export const subscribeAuthGeneration = (listener: () => void): (() => void) => {
  generationListeners.add(listener);
  return () => {
    generationListeners.delete(listener);
  };
};
export const getAuthGeneration = (): number => generation;
export const advanceAuthGeneration = (): void => {
  generation += 1;
  generationListeners.forEach((listener) => listener());
};
