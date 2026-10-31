import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CustomsDeclarationDetailPageContent } from "@/app/customs-declarations/components/CustomsDeclarationDetailPageContent";
import registry from "../../../../lifecycle/resources.json";
import { QuoteListPageContent } from "@/app/dashboard/quotes/components/QuoteListPageContent";
import { InventoryTab } from "@/app/dashboard/products/components/InventoryTab";
import { CustomsDeclarationListPageContent } from "@/app/customs-declarations/components/CustomsDeclarationListPageContent";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getById: vi.fn(),
  push: vi.fn(),
  documentNavigate: vi.fn((href: string) =>
    window.history.replaceState({}, "", href),
  ),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock(
  "@/app/customs-declarations/components/customs-return-context",
  async (original) => ({
    ...(await original<
      typeof import("@/app/customs-declarations/components/customs-return-context")
    >()),
    navigateToCustomsList: mocks.documentNavigate,
  }),
);
vi.mock("@/services/quote.service", () => ({
  quoteService: { getAll: mocks.getAll },
}));
vi.mock("@/services/inventory.service", () => ({
  inventoryService: { getAll: mocks.getAll },
}));
vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: { getAll: mocks.getAll, getById: mocks.getById },
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => false,
  BusinessWrite: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/api-cache", () => ({
  cachedFetch: (_key: string, fetcher: () => unknown) => fetcher(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAll.mockResolvedValue({
    data: { items: [], pagination: { total: 200 } },
  });
});

for (const list of registry.lists) {
  describe(`${list.id} registered list matrix`, () => {
    it.each(["immediate", "pending"])(
      "filter, paginate, return and refresh use the same URL state (%s response)",
      async (responseTiming) => {
        // A request spy records invocation before the response enables pagination.
        let completeInitialRead: (() => void) | undefined;
        if (responseTiming === "pending") {
          mocks.getAll.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                completeInitialRead = () =>
                  resolve({
                    data: { items: [], pagination: { total: 200 } },
                  });
              }),
          );
        }
        const url = new URL(list.path, window.location.origin);
        url.searchParams.set(list.keywordKey, "SYN");
        url.searchParams.set(list.pageKey, "2");
        url.searchParams.set(list.pageSizeKey, "50");
        window.history.replaceState({}, "", url);
        const component = () => {
          if (list.id === "inventory") return <InventoryTab />;
          if (list.id === "customs")
            return <CustomsDeclarationListPageContent embedded />;
          if (list.id === "quotes") return <QuoteListPageContent />;
          throw new Error(
            `Add an actual component adapter for ${list.id} in list-lifecycle.test.tsx`,
          );
        };
        let view = render(component());
        await waitFor(() =>
          expect(mocks.getAll).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 2, pageSize: 50, keyword: "SYN" }),
          ),
        );
        const nextPage = screen.getByRole("button", { name: "下一页" });
        if (responseTiming === "pending") {
          expect(nextPage).toBeDisabled();
          await act(async () => completeInitialRead!());
        }
        await waitFor(() => expect(nextPage).toBeEnabled());
        fireEvent.click(nextPage);
        await waitFor(() =>
          expect(mocks.getAll).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 3, pageSize: 50, keyword: "SYN" }),
          ),
        );
        const saved = window.location.href;
        expect(new URL(saved).searchParams.get(list.tabKey)).toBe(list.tab);
        expect(new URL(saved).searchParams.get(list.pageKey)).toBe("3");
        expect(new URL(saved).searchParams.get("source")).toBe("qa");
        expect(new URL(saved).hash).toBe("#rows");
        view.unmount();
        window.history.pushState({}, "", "/synthetic-detail");
        window.history.back();
        await waitFor(() => expect(window.location.href).toBe(saved));
        for (let refresh = 0; refresh < 2; refresh++) {
          mocks.getAll.mockClear();
          view = render(component());
          await waitFor(() =>
            expect(mocks.getAll).toHaveBeenLastCalledWith(
              expect.objectContaining({
                page: 3,
                pageSize: 50,
                keyword: "SYN",
              }),
            ),
          );
          expect(
            screen.getByPlaceholderText(
              {
                inventory: "搜索商品/采购合同...",
                quotes: "搜索编号、客户或备注...",
              }[list.id] ?? "搜索报关单号或报关行...",
            ),
          ).toHaveValue("SYN");
          view.unmount();
        }
      },
    );
  });
}

it("customs detail receives the active filtered return URL", async () => {
  const saved =
    "/dashboard/tax-refunds?view=customs&keyword=SYN&status=RELEASED&source=qa#rows";
  window.history.replaceState({}, "", saved);
  mocks.getAll.mockResolvedValue({
    data: {
      items: [
        {
          id: "synthetic-detail",
          declarationNo: "SYN",
          status: "RELEASED",
          totalAmount: 0,
          currency: "USD",
        },
      ],
      pagination: { total: 1 },
    },
  });
  render(<CustomsDeclarationListPageContent embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "查看详情 SYN" }));
  const destination = new URL(
    mocks.push.mock.calls.at(-1)![0],
    window.location.origin,
  );
  expect(destination.pathname).toBe(
    "/dashboard/customs-declarations/synthetic-detail",
  );
  expect(destination.searchParams.get("returnTo")).toBe(saved);
});

it("customs explicit return restores the active filtered URL from detail", async () => {
  const saved =
    "/dashboard/tax-refunds?view=customs&keyword=SYN&status=RELEASED&page=3&pageSize=50&source=qa#rows";
  window.history.replaceState(
    {},
    "",
    `/dashboard/customs-declarations/synthetic-detail?returnTo=${encodeURIComponent(saved)}`,
  );
  mocks.getById.mockResolvedValue({
    data: {
      id: "synthetic-detail",
      declarationNo: "SYN",
      status: "RELEASED",
      currency: "USD",
      totalAmount: 0,
      totalQuantity: 0,
      items: [],
    },
  });
  await act(async () => {
    render(
      <Suspense fallback={<div>Loading detail</div>}>
        <CustomsDeclarationDetailPageContent
          params={Promise.resolve({ id: "synthetic-detail" })}
        />
      </Suspense>,
    );
  });
  fireEvent.click(await screen.findByRole("button", { name: "返回" }));
  expect(mocks.documentNavigate).toHaveBeenCalledWith(saved);
  expect(
    window.location.pathname + window.location.search + window.location.hash,
  ).toBe(saved);
});
