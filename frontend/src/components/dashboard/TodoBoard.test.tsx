/**
 * Input: TodoBoard 与含长合同号、0 金额条目的待办
 * Output: 合同号不被截断、0 金额显示「—」的回归测试
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
