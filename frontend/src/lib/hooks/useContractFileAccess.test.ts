/** Obsolete media events cannot invalidate a newer authenticated preview. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useContractFileAccess } from "./useContractFileAccess";
import type { ContractFile } from "@/services/contractFile.service";
vi.mock("@/services/contractFile.service", async (original) => ({
  ...(await original<typeof import("@/services/contractFile.service")>()),
  fetchContractFileBlob: vi.fn(
    async () => new Blob(["synthetic"], { type: "image/png" }),
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("guards an old image/iframe onError by the exact temporary URL", async () => {
  let sequence = 0;
  const revoke = vi.fn();
  class ObjectURL extends URL {
    static createObjectURL = () => `blob:synthetic-${++sequence}`;
    static revokeObjectURL = revoke;
  }
  vi.stubGlobal("URL", ObjectURL);
  const { result } = renderHook(() =>
    useContractFileAccess("synthetic-contract"),
  );
  await act(async () =>
    result.current.openPreview({
      id: "old",
      fileName: "old.png",
    } as ContractFile),
  );
  const oldUrl = result.current.preview!.url!;
  const oldError = result.current.failPreview;
  await act(async () =>
    result.current.openPreview({
      id: "new",
      fileName: "new.png",
    } as ContractFile),
  );
  const newUrl = result.current.preview!.url!;
  expect(revoke).toHaveBeenCalledWith(oldUrl);
  act(() => oldError(oldUrl));
  expect(result.current.preview?.url).toBe(newUrl);
  expect(result.current.preview?.error).toBeNull();
  expect(revoke).not.toHaveBeenCalledWith(newUrl);
  act(() => result.current.failPreview(newUrl));
  expect(revoke).toHaveBeenCalledWith(newUrl);
  expect(result.current.preview?.error).toMatch(/浏览器无法显示/);
});
