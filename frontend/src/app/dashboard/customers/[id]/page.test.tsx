/**
 * Input: 客户详情页、合成客户/门店/订单数据
 * Output: 手机只读卡片（md:hidden）与桌面表格（hidden md:block）并存，点订单卡进入订单详情
 * Pos: 客户详情页手机端回归
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import CustomerDetailPage from "./page";

const push = vi.fn();
const getById = vi.fn();
const apiGet = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c-1" }),
  useRouter: () => ({ push }),
}));
vi.mock("@/services/customer.service", () => ({
  customerService: { getById: (...args: unknown[]) => getById(...args) },
}));
vi.mock("@/services/store.service", () => ({
  storeService: { update: vi.fn() },
}));
vi.mock("@/lib/axios", () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
}));
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: "BOSS" } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../components/CustomerDialog", () => ({ CustomerDialog: () => null }));
vi.mock("../components/StoreDialog", () => ({ StoreDialog: () => null }));

beforeEach(() => {
  push.mockReset();
  getById.mockResolvedValue({
    data: {
      id: "c-1",
      name: "合成客户",
      isActive: true,
      defaultCurrency: "USD",
      defaultIncoterm: "FOB",
      stores: [
        {
          id: "s-1",
          name: "合成门店A",
          code: "A",
          legalName: "合成经营主体",
          isActive: true,
          port: { name: "洛杉矶" },
        },
      ],
    },
  });
  apiGet.mockResolvedValue({
    data: {
      items: [
        {
          id: "o-1",
          contractNo: "EXP-SYN-1",
          status: "SHIPPED",
          totalAmount: 1234.5,
        },
      ],
    },
  });
});

it("门店与订单在手机上是只读卡片，点订单卡进入订单详情；桌面表格仍在 hidden md:block 里", async () => {
  const user = userEvent.setup();
  const { container } = render(<CustomerDetailPage />);
  const mobileLists = await waitFor(() => {
    const lists = container.querySelectorAll(".md\\:hidden");
    expect(lists.length).toBeGreaterThanOrEqual(2);
    return lists;
  });
  const storeCards = within(mobileLists[0] as HTMLElement);
  expect(storeCards.getByText("合成门店A")).toBeInTheDocument();
  expect(storeCards.getByText("洛杉矶")).toBeInTheDocument();
  expect(
    storeCards.queryByRole("button", { name: /编辑|停用/ }),
  ).not.toBeInTheDocument();

  const orderCards = within(mobileLists[1] as HTMLElement);
  expect(orderCards.getByText("1,234.50")).toBeInTheDocument();
  await user.click(orderCards.getByText("EXP-SYN-1"));
  expect(push).toHaveBeenCalledWith("/dashboard/sales/o-1");

  expect(container.querySelectorAll(".hidden.md\\:block").length).toBe(2);
  expect(screen.getAllByText("EXP-SYN-1").length).toBeGreaterThanOrEqual(2);
});
