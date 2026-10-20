/** Browser-session CSRF and auth generation stay in memory; subscribers discard sensitive file views on identity changes. */
let csrf: string | null = null;
export const getBrowserCsrf = (): string | null => csrf;
export const setBrowserCsrf = (value: string | null): void => {
  csrf = value;
};
export const getBrowserSessionHeaders = (): Record<string, string> =>
  csrf ? { "X-CSRF-Token": csrf } : {};

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
