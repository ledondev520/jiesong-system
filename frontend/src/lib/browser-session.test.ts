/** Auth generation listeners revoke ephemeral views without changing any credential policy. */
import { expect, it, vi } from "vitest";
import {
  advanceAuthGeneration,
  getAuthGeneration,
  subscribeAuthGeneration,
} from "./browser-session";
it("notifies synchronously after generation change and unsubscribes cleanly", () => {
  const initial = getAuthGeneration();
  const seen: number[] = [];
  const listener = vi.fn(() => seen.push(getAuthGeneration()));
  const stop = subscribeAuthGeneration(listener);
  advanceAuthGeneration();
  expect(seen).toEqual([initial + 1]);
  stop();
  advanceAuthGeneration();
  expect(listener).toHaveBeenCalledTimes(1);
});
