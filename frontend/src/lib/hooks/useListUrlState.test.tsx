import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { listUrlFields, useListUrlState } from "./useListUrlState";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("keyword=stale"),
}));
beforeEach(() => window.history.replaceState({}, "", "/dashboard/products"));

describe("list URL state", () => {
  it.each(["customs", "inventory"] as const)(
    "%s retains filters, page size and page on remount and browser traversal",
    (name) => {
      const fields = listUrlFields[name];
      const path =
        name === "customs"
          ? "/dashboard/customs?view=customs"
          : "/dashboard/inventory?x=1";
      window.history.replaceState({}, "", path + "&source=qa#rows");
      let hook = renderHook(() => useListUrlState(fields));
      act(() => hook.result.current[1]({ keyword: "瓷砖 & A", pageSize: 50 }));
      act(() => hook.result.current[1]({ page: 3 }));
      const saved = window.location.href;
      expect(new URL(saved).searchParams.get("source")).toBe("qa");
      expect(window.location.hash).toBe("#rows");
      hook.unmount();
      hook = renderHook(() => useListUrlState(fields));
      expect(hook.result.current[0]).toMatchObject({
        keyword: "瓷砖 & A",
        page: 3,
        pageSize: 50,
      });
      act(() => hook.result.current[1]({ keyword: "changed" }));
      expect(hook.result.current[0].page).toBe(1);
      act(() => {
        window.history.replaceState({}, "", saved);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(hook.result.current[0]).toMatchObject({
        keyword: "瓷砖 & A",
        page: 3,
        pageSize: 50,
      });
      act(() => hook.result.current[1]({ pageSize: 100 }));
      expect(hook.result.current[0].page).toBe(1);
    },
  );

  it("rejects invalid query values and ignores a stale tab=inventory bookmark", () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/products?tab=inventory&page=-1&pageSize=999&status=bad",
    );
    const list = renderHook(() => useListUrlState(listUrlFields.customs));
    expect(list.result.current[0]).toMatchObject({
      page: 1,
      pageSize: 20,
      status: "ALL",
    });
    expect(new URLSearchParams(window.location.search).get("tab")).toBe(
      "inventory",
    );
  });

  it("checks the current tab before publishing a stale event", () => {
    window.history.replaceState({}, "", "/dashboard/customs?view=customs");
    const { result } = renderHook(() =>
      useListUrlState(listUrlFields.customs, ["view", "customs"]),
    );
    window.history.replaceState({}, "", "/dashboard/customs?view=refunds");
    act(() => result.current[1]({ keyword: "late", page: 2 }));
    expect(window.location.search).toBe("?view=refunds");
  });
});
