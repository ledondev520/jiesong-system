import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/axios", () => ({ default: mocks }));
vi.mock("@/lib/auth-token", () => ({ getAuthToken: () => "tok" }));

import { quoteService } from "./quote.service";

describe("quoteService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists, reads, creates and edits against /quotes", async () => {
    await quoteService.getAll({ page: 2, keyword: "x" });
    expect(mocks.get).toHaveBeenCalledWith("/quotes", {
      params: { page: 2, keyword: "x" },
    });
    await quoteService.getById("q1");
    expect(mocks.get).toHaveBeenCalledWith("/quotes/q1", { params: undefined });
    await quoteService.create({ copyFromQuoteId: "q1" });
    expect(mocks.post).toHaveBeenCalledWith("/quotes", {
      copyFromQuoteId: "q1",
    });
    await quoteService.update("q1", { note: "n" });
    expect(mocks.put).toHaveBeenCalledWith("/quotes/q1", { note: "n" });
  });

  it("a transition sends the status alone (the backend refuses it mixed with fields)", async () => {
    await quoteService.transition("q1", "SENT");
    expect(mocks.put).toHaveBeenCalledWith("/quotes/q1", { status: "SENT" });
  });

  it("xlsx download uses the bearer token on the export URL", async () => {
    const blob = new Blob(["x"]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(blob, {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="QT1.xlsx"' },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    await quoteService.downloadXlsx("q1", "fallback.xlsx");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/quotes/q1/export.xlsx", {
      headers: { Authorization: "Bearer tok" },
    });
    vi.unstubAllGlobals();
  });

  it("a failed export surfaces the server message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "无权限执行此操作" }), {
          status: 403,
        }),
      ),
    );
    await expect(quoteService.downloadXlsx("q1", "x.xlsx")).rejects.toThrow(
      "无权限执行此操作",
    );
    vi.unstubAllGlobals();
  });
});
