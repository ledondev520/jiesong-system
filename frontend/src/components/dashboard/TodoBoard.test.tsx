/**
 * Input: TodoBoard 与含长合同号、0 金额、historical 的待办
 * Output: 合同号不被截断、0 金额显示「—」、历史未计入提示及完整列表入口的回归测试
 * Pos: 首页待办卡片展示测试
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodoBoard } from "./TodoBoard";
import type { DashboardTodos } from "@/services/dashboardTodos.service";

const todos: DashboardTodos = {
  role: "ADMIN",
  lists: {
    toShip: {
      label: "待发运",
      count: 1,
      items: [
        {
          id: "a",
          contractNo: "EXP260011",
          party: "某某进出口有限公司",
          amount: 0,
          date: null,
        },
      ],
    },
    paymentsDue: {
      label: "待付款",
      count: 1,
      items: [
        {
          id: "b",
          contractNo: "CG250123456",
          party: "供应商",
          amount: 100,
          date: null,
        },
      ],
    },
  },
};

describe("TodoBoard", () => {
  it("合同号不截断，供应商名可截断", () => {
    render(<TodoBoard todos={todos} />);
    expect(screen.getByText("CG250123456").className).not.toContain("truncate");
    expect(screen.getByText("供应商").className).toContain("truncate");
    expect(screen.getByText("供应商").className).not.toContain("shrink-0");
  });

  it("0 金额显示「—」而非 $0", () => {
    render(<TodoBoard todos={todos} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });
});

const historicalTodos = (
  historicalCount: number,
  count = 10,
): DashboardTodos => ({
  role: "FINANCE",
  lists: {
    paymentsDue: {
      label: "待付款",
      count,
      items: [],
      historical: { count: historicalCount, before: "2026-01-01" },
    },
  },
});

describe("TodoBoard historical note", () => {
  it("shows the uncounted historical total with a link to the full list", () => {
    render(<TodoBoard todos={historicalTodos(88)} />);
    expect(screen.getByText(/另有 88 条/)).toHaveTextContent(
      "签约早于 2026-01-01 的历史记录未计入",
    );
    expect(screen.getByRole("link", { name: "查看完整列表" })).toHaveAttribute(
      "href",
      "/dashboard/payments?tab=payable",
    );
  });

  it("hides the note when nothing is excluded", () => {
    render(<TodoBoard todos={historicalTodos(0)} />);
    expect(screen.queryByText(/历史记录未计入/)).toBeNull();
  });

  it("does not say everything is done while historical rows remain", () => {
    render(<TodoBoard todos={historicalTodos(88, 0)} />);
    expect(screen.queryByText("全部处理完毕")).toBeNull();
    expect(screen.getByText(/另有 88 条/)).toBeInTheDocument();
  });
});

describe("TodoBoard scope labels at the number (B13)", () => {
  it("states the historical exclusion next to the count itself", () => {
    render(<TodoBoard todos={historicalTodos(88)} />);
    expect(screen.getByTestId("paymentsDue-scope")).toHaveTextContent(
      "仅含 2026-01-01 起签约，不含 88 条历史",
    );
  });

  it("shows no scope label when nothing is excluded", () => {
    render(<TodoBoard todos={historicalTodos(0)} />);
    expect(screen.queryByTestId("paymentsDue-scope")).toBeNull();
  });

  it("shows the rebate workbench pending total beside the ready count", () => {
    render(
      <TodoBoard
        todos={{
          role: "FINANCE",
          lists: {
            refundable: {
              label: "可申报退税",
              count: 0,
              items: [],
              pending: { count: 46, label: "待处理出口" },
            },
          },
        }}
      />,
    );
    expect(screen.getByTestId("refundable-scope")).toHaveTextContent(
      "材料核验通过；工作台共 46 个待处理出口",
    );
  });
});
