import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PurchaseContract } from "@/types";
import { ReceivingWorkbench, stageOf } from "./ReceivingWorkbench";

const getAll = vi.fn();
vi.mock("@/services/purchase.service", () => ({
  purchaseService: { getAll: (...args: unknown[]) => getAll(...args) },
}));
let readOnly = false;
let role = "SALES";
vi.mock("@/store/auth.store", () => ({
  useAuthStore: (select: (state: { user: { role: string } }) => unknown) =>
    select({ user: { role } }),
}));
vi.mock("@/lib/hooks/useBusinessReadOnly", () => ({
  useBusinessReadOnly: () => readOnly,
}));
const panel = vi.fn();
vi.mock(
  "@/app/dashboard/purchases/[id]/components/PurchaseReceiptPanel",
  () => ({
    PurchaseReceiptPanel: (props: {
      purchaseContractId: string;
      readOnly?: boolean;
      onChanged?: () => void;
    }) => {
      panel(props);
      return (
        <button type="button" onClick={() => props.onChanged?.()}>
          面板 {props.purchaseContractId}
        </button>
      );
    },
  }),
);

const contract = (
  id: string,
  state?: "NONE" | "PARTIAL" | "FULL",
): PurchaseContract =>
  ({
    id,
    contractNo: `PC-${id}`,
    supplier: { name: `供应商${id}` },
    storeName: "一店",
    expectedDate: "2026-11-10",
    status: "SHIPPED",
    subStatus: state && {
      payment: "UNPAID",
      docsComplete: true,
      arrival: {
        state,
        ordered: 100,
        arrived: state === "FULL" ? 100 : 40,
        registered: state !== "NONE",
      },
    },
  }) as unknown as PurchaseContract;

const reply = (items: PurchaseContract[], total = items.length) => ({
  data: { items, pagination: { total } },
});

beforeEach(() => {
  getAll.mockReset();
  panel.mockReset();
  readOnly = false;
  role = "SALES";
});

describe("stageOf", () => {
  it("按登记到货量分阶段；没有子状态的旧数据算待到货", () => {
    expect(stageOf(contract("a", "NONE"))).toBe("pending");
    expect(stageOf(contract("b", "PARTIAL"))).toBe("partial");
    expect(stageOf(contract("c", "FULL"))).toBe("complete");
    expect(stageOf(contract("d"))).toBe("pending");
  });
});

describe("ReceivingWorkbench", () => {
  it("只请求已发货合同；阶段计数来自到货子状态，切换阶段只显示该阶段的合同", async () => {
    getAll.mockResolvedValue(
      reply([
        contract("1", "NONE"),
        contract("2", "PARTIAL"),
        contract("3", "PARTIAL"),
        contract("4", "FULL"),
      ]),
    );
    const user = userEvent.setup();
    render(<ReceivingWorkbench />);
    expect(await screen.findAllByText("PC-1")).not.toHaveLength(0);
    expect(getAll).toHaveBeenCalledWith({
      status: "SHIPPED",
      page: 1,
      pageSize: 100,
    });
    expect(
      screen.getByRole("button", { name: /待到货\s*1/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /部分到货\s*2/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /已到齐待验收\s*1/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("PC-2")).toBeNull();

    await user.click(screen.getByRole("button", { name: /部分到货/ }));
    expect(screen.getAllByText("PC-2").length).toBeGreaterThan(0);
    expect(screen.queryByText("PC-1")).toBeNull();
    // 不冒充验货状态：没有「待复验」「今日已收」阶段
    expect(
      screen.queryByRole("button", { name: /待复验|今日已收/ }),
    ).toBeNull();
  });

  it("加载中计数显示「—」而不是 0；阶段为空给出说明", async () => {
    getAll.mockResolvedValue(reply([contract("1", "FULL")]));
    render(<ReceivingWorkbench />);
    expect(
      screen.getByRole("button", { name: /待到货\s*—/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("没有「待到货」的合同")).toBeInTheDocument();
  });

  it("加载失败显示原因并可重试，计数不显示 0", async () => {
    getAll.mockRejectedValueOnce(new Error("网络错误"));
    getAll.mockResolvedValueOnce(reply([contract("1", "NONE")]));
    const user = userEvent.setup();
    render(<ReceivingWorkbench />);
    expect(await screen.findByText(/加载待收货合同失败/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /待到货\s*—/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect((await screen.findAllByText("PC-1")).length).toBeGreaterThan(0);
  });

  it("侧栏里打开现有的到货验货面板（同一合同、同一权限），登记后刷新队列且侧栏保持打开", async () => {
    getAll.mockResolvedValue(reply([contract("1", "NONE")]));
    const user = userEvent.setup();
    render(<ReceivingWorkbench />);
    await screen.findAllByText("PC-1");
    await user.click(
      screen.getAllByRole("button", { name: "登记到货 / 验货" })[0],
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("PC-1")).toBeInTheDocument();
    expect(panel).toHaveBeenLastCalledWith(
      expect.objectContaining({ purchaseContractId: "1", readOnly: false }),
    );

    // 登记后合同离开「已发货」队列，侧栏不应被关掉
    getAll.mockResolvedValueOnce(reply([]));
    await user.click(within(dialog).getByRole("button", { name: "面板 1" }));
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("没有「待到货」的合同")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("只读账号：按钮改为「查看到货」，面板收到 readOnly", async () => {
    readOnly = true;
    getAll.mockResolvedValue(reply([contract("1", "NONE")]));
    const user = userEvent.setup();
    render(<ReceivingWorkbench />);
    await screen.findAllByText("PC-1");
    expect(
      screen.queryByRole("button", { name: "登记到货 / 验货" }),
    ).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "查看到货" })[0]);
    await screen.findByRole("dialog");
    expect(panel).toHaveBeenLastCalledWith(
      expect.objectContaining({ readOnly: true }),
    );
  });

  it("已发货合同超过一屏时明确提示，不悄悄截断", async () => {
    getAll.mockResolvedValue(reply([contract("1", "NONE")], 250));
    render(<ReceivingWorkbench />);
    expect(
      await screen.findByText(
        /只显示合同号最新的 1 条（共 250 条已发货合同），上方阶段计数只统计这些/,
      ),
    ).toBeInTheDocument();
  });

  it("没有写入权限的角色（OD-8 停用的 FINANCE）按钮是「查看到货」，不许诺能登记", async () => {
    role = "FINANCE";
    getAll.mockResolvedValue(reply([contract("1", "NONE")]));
    render(<ReceivingWorkbench />);
    await screen.findAllByText("PC-1");
    expect(
      screen.queryByRole("button", { name: "登记到货 / 验货" }),
    ).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "查看到货" }).length,
    ).toBeGreaterThan(0);
  });
});
