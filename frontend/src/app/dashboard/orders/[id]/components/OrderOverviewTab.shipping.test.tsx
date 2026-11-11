/**
 * Input: 合成出口订单（草稿/已发运）
 * Output: 概览「发运信息」卡：柜号、目的港、发运/到港日期、报关行、提单号如实标「未记录」、打印入口，以及已发运订单的合同独立性说明
 * Pos: B55 回归测试；纯渲染，不发请求
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SalesStatus, type SalesContract } from "@/types";
import { OrderOverviewTab } from "./OrderOverviewTab";
import type { OrderReadiness } from "./orderDetailModel";

const readiness = {
  totals: { cartons: 0, grossKg: 0, cargoCbm: 0 },
  plan: { containerType: "40HQ" },
  headline: "",
  isBlocking: false,
  hasShipped: false,
} as unknown as OrderReadiness;

const contract = (patch: Partial<SalesContract>) =>
  ({
    id: "s1",
    contractNo: "EXP-B55",
    status: SalesStatus.CONFIRMED,
    totalAmount: 0,
    receivedAmount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    items: [],
    packingItems: [],
    port: { id: "p", name: "洛杉矶" },
    ...patch,
  }) as unknown as SalesContract;

describe("OrderOverviewTab 发运信息", () => {
  it("集中展示柜号/目的港/日期/报关行，提单号如实标未记录，未发运不显示合同说明", () => {
    render(
      <OrderOverviewTab
        contract={contract({ estimatedArrival: "2026-11-15T04:00:00.000Z" })}
        readiness={readiness}
      />,
    );
    const info = document.getElementById("order-shipping-print-root")!;
    expect(info).toHaveTextContent("订单号EXP-B55");
    // 没有物理货柜编号：如实写「未记录」，不用订单号冒充
    expect(info).toHaveTextContent("柜号未记录");
    expect(info).toHaveTextContent("40HQ");
    expect(info).toHaveTextContent("洛杉矶");
    expect(info).toHaveTextContent("2026-11-15");
    expect(info).toHaveTextContent("提单号");
    expect(info).toHaveTextContent("未记录");
    // 没有发运日期/报关行：显示「—」，不是空白或 Invalid Date
    expect(info).toHaveTextContent("发运日期—");
    expect(info).toHaveTextContent("报关行—");
    expect(screen.queryByText(/订单状态与外销合同文件相互独立/)).toBeNull();
  });

  it("提单号取 blNo，没有则如实标未记录", () => {
    render(
      <OrderOverviewTab
        contract={contract({ blNo: "MAEU123456789" })}
        readiness={readiness}
      />,
    );
    const info = document.getElementById("order-shipping-print-root")!;
    expect(info).toHaveTextContent("提单号MAEU123456789");
    expect(info).not.toHaveTextContent("提单号未记录");
  });

  it("柜号取物理货柜编号 containerLabel，订单号单独显示", () => {
    render(
      <OrderOverviewTab
        contract={contract({ containerLabel: "02-振宗" })}
        readiness={readiness}
      />,
    );
    const info = document.getElementById("order-shipping-print-root")!;
    expect(info).toHaveTextContent("柜号02-振宗");
    expect(info).toHaveTextContent("订单号EXP-B55");
    expect(info).not.toHaveTextContent("系统以订单号标识货柜");
  });

  it("已发运订单解释为什么可以先发运后补合同，并可打印", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(
      <OrderOverviewTab
        contract={contract({
          status: SalesStatus.SHIPPED,
          shippedAt: "2026-10-20T04:00:00.000Z",
          customsBroker: "合成报关行",
        })}
        readiness={readiness}
      />,
    );
    expect(
      screen.getByText(/订单状态与外销合同文件相互独立/),
    ).toBeInTheDocument();
    expect(screen.getByText(/生成出口单证/)).toBeInTheDocument();
    expect(screen.getAllByText("2026-10-20").length).toBeGreaterThan(0);
    expect(screen.getAllByText("合成报关行").length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "打印" }));
    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

describe("OrderOverviewTab 金额（OD-7）", () => {
  it("SALES 不显示合同金额/已收款/未收款卡片，ADMIN 显示", async () => {
    const { useAuthStore } = await import("@/store/auth.store");
    useAuthStore.setState({ user: { id: "s", role: "SALES" } as never });
    const { unmount } = render(
      <OrderOverviewTab
        contract={contract({
          totalAmount: undefined,
          receivedAmount: undefined,
        } as never)}
        readiness={readiness}
      />,
    );
    expect(screen.queryByText("合同金额")).toBeNull();
    expect(screen.queryByText("已收款")).toBeNull();
    unmount();
    useAuthStore.setState({ user: { id: "a", role: "ADMIN" } as never });
    render(<OrderOverviewTab contract={contract({})} readiness={readiness} />);
    expect(screen.getByText("合同金额")).toBeInTheDocument();
  });
});
