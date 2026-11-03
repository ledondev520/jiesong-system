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

it("订单状态显示中文名而不是 DRAFT/PACKING/SHIPPED 原值 (B46)", async () => {
  const codes = ["DRAFT", "CONFIRMED", "PACKING", "SHIPPED", "COMPLETED"];
  apiGet.mockResolvedValue({
    data: {
      items: codes.map((status, index) => ({
        id: `o-${index}`,
        contractNo: `EXP-SYN-${index}`,
        status,
        totalAmount: 1,
      })),
    },
  });
  const { container } = render(<CustomerDetailPage />);
  await screen.findAllByText("EXP-SYN-0");
  const text = container.textContent ?? "";
  for (const label of ["草稿", "已确认", "装柜中", "已发运", "已完成"]) {
    expect(text).toContain(label);
  }
  for (const code of codes) expect(text).not.toContain(code);
});

it("档案多数字段为空时提示「档案待完善」，填写完整则不提示 (B46)", async () => {
  const { unmount } = render(<CustomerDetailPage />);
  expect(await screen.findByText(/档案待完善/)).toBeInTheDocument();
  unmount();

  getById.mockResolvedValue({
    data: {
      id: "c-1",
      name: "合成客户",
      isActive: true,
      defaultCurrency: "USD",
      defaultIncoterm: "FOB",
      defaultPaymentTerms: "T/T 30 天",
      defaultPortOfLoading: "宁波",
      contactName: "合成联系人",
      contactPhone: "000",
      contactEmail: "syn@example.test",
      country: "US",
      address: "合成地址",
      stores: [],
    },
  });
  render(<CustomerDetailPage />);
  await screen.findByText("合成联系人");
  expect(screen.queryByText(/档案待完善/)).not.toBeInTheDocument();
});
