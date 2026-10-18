import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import registry from "../../../../lifecycle/resources.json";
import { InventoryTab } from "@/app/dashboard/products/components/InventoryTab";
import { CustomsDeclarationListPageContent } from "@/app/customs-declarations/components/CustomsDeclarationListPageContent";

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/services/inventory.service", () => ({
  inventoryService: { getAll: mocks.getAll },
}));
vi.mock("@/services/customsDeclaration.service", () => ({
  customsDeclarationService: { getAll: mocks.getAll },
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
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
    it("filter, paginate, return and refresh use the same URL state", async () => {
      const url = new URL(list.path, window.location.origin);
      url.searchParams.set(list.keywordKey, "SYN");
      url.searchParams.set(list.pageKey, "2");
      url.searchParams.set(list.pageSizeKey, "50");
      window.history.replaceState({}, "", url);
      const component = () => {
        if (list.id === "inventory") return <InventoryTab />;
        if (list.id === "customs")
          return <CustomsDeclarationListPageContent embedded />;
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
      fireEvent.click(screen.getByRole("button", { name: "下一页" }));
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
        view = render(component());
        await waitFor(() =>
          expect(mocks.getAll).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 3, pageSize: 50, keyword: "SYN" }),
          ),
        );
        expect(
          screen.getByPlaceholderText(
            list.id === "inventory"
              ? "搜索商品/采购合同..."
              : "搜索报关单号或报关行...",
          ),
        ).toHaveValue("SYN");
        view.unmount();
      }
    });
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
