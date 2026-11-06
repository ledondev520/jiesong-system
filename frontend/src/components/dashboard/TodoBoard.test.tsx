<<<<<<< Updated upstream
/**
 * Input: TodoBoard 与含长合同号、0 金额、historical 的待办
 * Output: 合同号不被截断、0 金额显示「—」、历史未计入提示及完整列表入口的回归测试
 * Pos: 首页待办卡片展示测试
 */
=======
>>>>>>> Stashed changes
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodoBoard } from "./TodoBoard";
import type { DashboardTodos } from "@/services/dashboardTodos.service";

const todos = {
  role: "ADMIN",
  lists: {
    toShip: {
      label: "待发运",
      count: 2,
      items: [
        {
          id: "a",
          contractNo: "EXP260011",
          party: null,
          amount: 0,
          date: null,
        },
        {
          id: "b",
          contractNo: "CG250001",
          party: "很长的供应商名称",
          amount: 12,
          date: null,
        },
      ],
    },
  },
} as unknown as DashboardTodos;

describe("TodoBoard 行", () => {
  it("合同号不截断（shrink-0），让供应商名称承担截断", () => {
    render(<TodoBoard todos={todos} />);
<<<<<<< Updated upstream
    expect(screen.getByText("CG250123456").className).not.toContain("truncate");
    expect(screen.getByText("供应商").className).toContain("truncate");
    expect(screen.getByText("供应商").className).not.toContain("shrink-0");
=======
    const link = screen.getByText("CG250001");
    expect(link.className).toContain("shrink-0");
    expect(link.className).not.toContain("truncate");
    expect(screen.getByText("很长的供应商名称").className).toContain(
      "truncate",
    );
>>>>>>> Stashed changes
  });

  it("金额为 0 时显示「—」而不是 $0", () => {
    render(<TodoBoard todos={todos} />);
    expect(screen.queryByText("$0")).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("$12")).toBeInTheDocument();
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

  it("keeps the base scope note but no exclusion when nothing is excluded", () => {
    render(<TodoBoard todos={historicalTodos(0)} />);
    const note = screen.getByTestId("paymentsDue-scope");
    expect(note).toHaveTextContent("已生效采购合同，应付金额大于 0");
    expect(note).not.toHaveTextContent("历史");
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
      "退税工作台本月共 46 个待处理出口",
    );
    expect(screen.getByRole("link", { name: "去退税工作台" })).toHaveAttribute(
      "href",
      "/dashboard/tax-refunds",
    );
  });
});

describe("TodoBoard credibility (B49)", () => {
  const list = (label: string, count: number, party: string | null = null) => ({
    label,
    count,
    items: count
      ? [{ id: "x", contractNo: "N1", party, amount: null, date: null }]
      : [],
  });
  const board: DashboardTodos = {
    role: "ADMIN",
    lists: {
      quotesToSend: list("报价待发送", 0),
      toShip: list("待发运", 1),
      paymentsDue: list("待付款", 10),
      overdueReceivables: list("逾期未收款", 25),
    },
  };

  it("header total equals the sum of the card counts", () => {
    render(<TodoBoard todos={board} />);
    expect(screen.getByTestId("todo-total")).toHaveTextContent("共 36 项待办");
  });

  it("every card carries a scope note", () => {
    render(<TodoBoard todos={board} />);
    for (const key of Object.keys(board.lists)) {
      expect(screen.getByTestId(`${key}-scope`)).not.toBeEmptyDOMElement();
    }
  });

  it("falls back to a labelled placeholder for a missing party", () => {
    render(<TodoBoard todos={board} />);
    expect(screen.getByText("未登记供应商")).toBeInTheDocument();
  });

  it("does not call a party unregistered when the backend never sends one", () => {
    render(<TodoBoard todos={board} />);
    // toShip 与 overdueReceivables 后端恒为 party=null
    expect(screen.queryByText("未登记客户")).toBeNull();
  });
});
