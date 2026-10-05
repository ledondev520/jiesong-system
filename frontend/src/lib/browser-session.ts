/** Browser-session CSRF proof lives only in memory; the HttpOnly credential is never exposed. */
let csrf: string | null = null;
export const getBrowserCsrf = (): string | null => csrf;
export const setBrowserCsrf = (value: string | null): void => {
  csrf = value;
};
export const getBrowserSessionHeaders = (): Record<string, string> =>
  csrf ? { "X-CSRF-Token": csrf } : {};

let generation = 0;
export const getAuthGeneration = (): number => generation;
export const advanceAuthGeneration = (): void => {
  generation += 1;
};
